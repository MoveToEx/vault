package crypto

import (
	"bytes"
	"crypto/mlkem"
	"crypto/rand"
	"crypto/sha3"
	"errors"
	"io"

	"golang.org/x/crypto/chacha20poly1305"
	"golang.org/x/crypto/curve25519"
)

const (
	CryptoKEMPublicKeyBytes  = 1216
	CryptoKEMSecretKeyBytes  = 32
	CryptoKEMCiphertextBytes = 1120
	CryptoKEMSharedKeyBytes  = 32

	xWingMLKEMPublicKeyBytes  = 1184
	xWingMLKEMSecretSeedBytes = 64
	xWingMLKEMCiphertextBytes = 1088
	xWingX25519KeyBytes       = 32

	XChaCha20Poly1305KeyBytes   = chacha20poly1305.KeySize
	XChaCha20Poly1305NonceBytes = chacha20poly1305.NonceSizeX
	XChaCha20Poly1305MACBytes   = chacha20poly1305.Overhead
)

var (
	errInvalidKEMPublicKeyLength  = errors.New("invalid KEM public key length")
	errInvalidKEMSecretKeyLength  = errors.New("invalid KEM secret key length")
	errInvalidKEMCiphertextLength = errors.New("invalid KEM ciphertext length")
)

var xWingLabel = []byte{0x5c, 0x2e, 0x2f, 0x2f, 0x5e, 0x5c}

type xWingExpandedSecretKey struct {
	mlkemSecret  *mlkem.DecapsulationKey768
	x25519Secret [xWingX25519KeyBytes]byte
	x25519Public [xWingX25519KeyBytes]byte
}

type KEMEncryptedBytes struct {
	KEMCiphertext []byte
	Nonce         []byte
	Ciphertext    []byte
}

// CryptoKEMKeypair returns an X-Wing key pair, following the shape of
// libsodium's crypto_kem_keypair.
func CryptoKEMKeypair() (publicKey, secretKey []byte, err error) {
	return cryptoKEMKeypair(rand.Reader)
}

func cryptoKEMKeypair(rng io.Reader) (publicKey, secretKey []byte, err error) {
	secretKey = make([]byte, CryptoKEMSecretKeyBytes)
	if _, err := io.ReadFull(rng, secretKey); err != nil {
		return nil, nil, err
	}

	publicKey, err = CryptoKEMPublicKey(secretKey)
	if err != nil {
		return nil, nil, err
	}
	return publicKey, secretKey, nil
}

// CryptoKEMPublicKey derives the X-Wing public key for a 32-byte secret key.
func CryptoKEMPublicKey(secretKey []byte) ([]byte, error) {
	expanded, err := expandXWingSecretKey(secretKey)
	if err != nil {
		return nil, err
	}

	mlkemPublic := expanded.mlkemSecret.EncapsulationKey().Bytes()
	publicKey := make([]byte, 0, CryptoKEMPublicKeyBytes)
	publicKey = append(publicKey, mlkemPublic...)
	publicKey = append(publicKey, expanded.x25519Public[:]...)
	return publicKey, nil
}

// CryptoKEMEnc encapsulates a shared key to publicKey and returns
// (ciphertext, sharedKey), matching libsodium's crypto_kem_enc data flow.
func CryptoKEMEnc(publicKey []byte) (ciphertext, sharedKey []byte, err error) {
	if len(publicKey) != CryptoKEMPublicKeyBytes {
		return nil, nil, errInvalidKEMPublicKeyLength
	}

	mlkemPublic, err := mlkem.NewEncapsulationKey768(publicKey[:xWingMLKEMPublicKeyBytes])
	if err != nil {
		return nil, nil, err
	}
	pkX := publicKey[xWingMLKEMPublicKeyBytes:]

	ekX, ctX, err := generateX25519Keypair(rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	ssX, err := curve25519.X25519(ekX, pkX)
	if err != nil {
		return nil, nil, err
	}

	ssM, ctM := mlkemPublic.Encapsulate()
	sharedKey = xWingCombiner(ssM, ssX, ctX, pkX)

	ciphertext = make([]byte, 0, CryptoKEMCiphertextBytes)
	ciphertext = append(ciphertext, ctM...)
	ciphertext = append(ciphertext, ctX...)
	return ciphertext, sharedKey, nil
}

// CryptoKEMDec decapsulates ciphertext with secretKey and returns the shared key,
// following the shape of libsodium's crypto_kem_dec.
func CryptoKEMDec(ciphertext, secretKey []byte) ([]byte, error) {
	if len(ciphertext) != CryptoKEMCiphertextBytes {
		return nil, errInvalidKEMCiphertextLength
	}

	expanded, err := expandXWingSecretKey(secretKey)
	if err != nil {
		return nil, err
	}

	ctM := ciphertext[:xWingMLKEMCiphertextBytes]
	ctX := ciphertext[xWingMLKEMCiphertextBytes:]
	ssM, err := expanded.mlkemSecret.Decapsulate(ctM)
	if err != nil {
		return nil, err
	}
	ssX, err := curve25519.X25519(expanded.x25519Secret[:], ctX)
	if err != nil {
		return nil, err
	}

	return xWingCombiner(ssM, ssX, ctX, expanded.x25519Public[:]), nil
}

// CryptoKEMEncryptBytes encapsulates a fresh shared key to recipientPublicKey
// and encrypts plaintext with XChaCha20-Poly1305-IETF.
func CryptoKEMEncryptBytes(recipientPublicKey, plaintext, additionalData []byte) (*KEMEncryptedBytes, error) {
	kemCiphertext, sharedKey, err := CryptoKEMEnc(recipientPublicKey)
	if err != nil {
		return nil, err
	}

	key, err := CryptoKDFDeriveFromKey(32, 364330789, "KEM_LOGK", sharedKey)

	if err != nil {
		return nil, err
	}

	subkey, err := CryptoKDFDeriveFromKey(32, 0, "KEM_AEAD", key)
	if err != nil {
		return nil, err
	}

	nonce, err := CryptoKDFDeriveFromKey(24, 0, "KEM_NPUB", key)
	if err != nil {
		return nil, err
	}

	aead, err := chacha20poly1305.NewX(subkey)
	if err != nil {
		return nil, err
	}

	return &KEMEncryptedBytes{
		KEMCiphertext: kemCiphertext,
		Nonce:         nonce,
		Ciphertext:    aead.Seal(nil, nonce, plaintext, additionalData),
	}, nil
}

// CryptoKEMDecryptBytes decapsulates the shared key and opens an
// XChaCha20-Poly1305-IETF ciphertext produced by CryptoKEMEncryptBytes.
func CryptoKEMDecryptBytes(secretKey []byte, encrypted *KEMEncryptedBytes, additionalData []byte) ([]byte, error) {
	if encrypted == nil {
		return nil, errors.New("encrypted bytes is nil")
	}
	if len(encrypted.Nonce) != XChaCha20Poly1305NonceBytes {
		return nil, errors.New("invalid XChaCha20-Poly1305 nonce length")
	}

	sharedKey, err := CryptoKEMDec(encrypted.KEMCiphertext, secretKey)
	if err != nil {
		return nil, err
	}
	nonce, err := deriveXChaCha20Nonce(sharedKey)
	if err != nil {
		return nil, err
	}
	if !bytes.Equal(encrypted.Nonce, nonce) {
		return nil, errors.New("invalid XChaCha20-Poly1305 nonce")
	}

	aead, err := chacha20poly1305.NewX(sharedKey)
	if err != nil {
		return nil, err
	}
	return aead.Open(nil, nonce, encrypted.Ciphertext, additionalData)
}

func expandXWingSecretKey(secretKey []byte) (*xWingExpandedSecretKey, error) {
	if len(secretKey) != CryptoKEMSecretKeyBytes {
		return nil, errInvalidKEMSecretKeyLength
	}

	expanded := make([]byte, xWingMLKEMSecretSeedBytes+xWingX25519KeyBytes)
	shake := sha3.NewSHAKE256()
	if _, err := shake.Write(secretKey); err != nil {
		return nil, err
	}
	if _, err := io.ReadFull(shake, expanded); err != nil {
		return nil, err
	}

	mlkemSecret, err := mlkem.NewDecapsulationKey768(expanded[:xWingMLKEMSecretSeedBytes])
	if err != nil {
		return nil, err
	}

	var x25519Secret [xWingX25519KeyBytes]byte
	copy(x25519Secret[:], expanded[xWingMLKEMSecretSeedBytes:])

	x25519PublicBytes, err := curve25519.X25519(x25519Secret[:], curve25519.Basepoint)
	if err != nil {
		return nil, err
	}
	var x25519Public [xWingX25519KeyBytes]byte
	copy(x25519Public[:], x25519PublicBytes)

	return &xWingExpandedSecretKey{
		mlkemSecret:  mlkemSecret,
		x25519Secret: x25519Secret,
		x25519Public: x25519Public,
	}, nil
}

func generateX25519Keypair(rng io.Reader) (secretKey, publicKey []byte, err error) {
	secretKey = make([]byte, xWingX25519KeyBytes)
	if _, err := io.ReadFull(rng, secretKey); err != nil {
		return nil, nil, err
	}

	publicKey, err = curve25519.X25519(secretKey, curve25519.Basepoint)
	if err != nil {
		return nil, nil, err
	}
	return secretKey, publicKey, nil
}

func xWingCombiner(ssM, ssX, ctX, pkX []byte) []byte {
	hash := sha3.New256()
	hash.Write(ssM)
	hash.Write(ssX)
	hash.Write(ctX)
	hash.Write(pkX)
	hash.Write(xWingLabel)
	return hash.Sum(nil)
}
