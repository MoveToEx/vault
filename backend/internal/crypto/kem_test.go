package crypto

import (
	"bytes"
	"testing"
)

func TestCryptoKEMRoundTrip(t *testing.T) {
	publicKey, secretKey, err := CryptoKEMKeypair()
	if err != nil {
		t.Fatal(err)
	}
	if len(publicKey) != CryptoKEMPublicKeyBytes {
		t.Fatalf("public key length = %d, want %d", len(publicKey), CryptoKEMPublicKeyBytes)
	}
	if len(secretKey) != CryptoKEMSecretKeyBytes {
		t.Fatalf("secret key length = %d, want %d", len(secretKey), CryptoKEMSecretKeyBytes)
	}

	ciphertext, encapsulatedSharedKey, err := CryptoKEMEnc(publicKey)
	if err != nil {
		t.Fatal(err)
	}
	if len(ciphertext) != CryptoKEMCiphertextBytes {
		t.Fatalf("ciphertext length = %d, want %d", len(ciphertext), CryptoKEMCiphertextBytes)
	}
	if len(encapsulatedSharedKey) != CryptoKEMSharedKeyBytes {
		t.Fatalf("shared key length = %d, want %d", len(encapsulatedSharedKey), CryptoKEMSharedKeyBytes)
	}

	decapsulatedSharedKey, err := CryptoKEMDec(ciphertext, secretKey)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(encapsulatedSharedKey, decapsulatedSharedKey) {
		t.Fatal("shared keys differ")
	}
}

func TestCryptoKEMEncryptBytesRoundTrip(t *testing.T) {
	publicKey, secretKey, err := CryptoKEMKeypair()
	if err != nil {
		t.Fatal(err)
	}

	plaintext := []byte("small sealed payload")
	additionalData := []byte("metadata-v1")
	encrypted, err := CryptoKEMEncryptBytes(publicKey, plaintext, additionalData)
	if err != nil {
		t.Fatal(err)
	}
	if len(encrypted.KEMCiphertext) != CryptoKEMCiphertextBytes {
		t.Fatalf("KEM ciphertext length = %d, want %d", len(encrypted.KEMCiphertext), CryptoKEMCiphertextBytes)
	}
	if len(encrypted.Nonce) != XChaCha20Poly1305NonceBytes {
		t.Fatalf("nonce length = %d, want %d", len(encrypted.Nonce), XChaCha20Poly1305NonceBytes)
	}
	if len(encrypted.Ciphertext) != len(plaintext)+XChaCha20Poly1305MACBytes {
		t.Fatalf("ciphertext length = %d, want %d", len(encrypted.Ciphertext), len(plaintext)+XChaCha20Poly1305MACBytes)
	}

	opened, err := CryptoKEMDecryptBytes(secretKey, encrypted, additionalData)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(opened, plaintext) {
		t.Fatalf("opened = %q, want %q", opened, plaintext)
	}

	if _, err := CryptoKEMDecryptBytes(secretKey, encrypted, []byte("metadata-v2")); err == nil {
		t.Fatal("decrypt with wrong additional data succeeded")
	}
}
