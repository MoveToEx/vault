package audit

import (
	"crypto/rand"
	"errors"
	"io"

	"golang.org/x/crypto/blake2b"
	"golang.org/x/crypto/nacl/box"
)

const (
	boxPublicKeySize  = 32
	boxPrivateKeySize = 32
)

// SealMessage implements the same layout as libsodium crypto_box_seal:
// ephemeral_pk ‖ box(m, recipient_pk, ephemeral_sk, nonce),
// where nonce is the first 24 bytes of BLAKE2b-256(ephemeral_pk ‖ recipient_pk)
// with a 24-byte digest (matching crypto_generichash output length 24).
func SealMessage(recipientPublicKey []byte, plaintext []byte) ([]byte, error) {
	if len(recipientPublicKey) != boxPublicKeySize {
		return nil, errors.New("invalid recipient public key length")
	}
	return sealMessage(recipientPublicKey, plaintext, rand.Reader)
}

func sealMessage(recipientPublicKey []byte, plaintext []byte, rng io.Reader) ([]byte, error) {
	pub, priv, err := box.GenerateKey(rng)
	if err != nil {
		return nil, err
	}

	var recipient [boxPublicKeySize]byte
	copy(recipient[:], recipientPublicKey)

	h, err := blake2b.New(24, nil)
	if err != nil {
		return nil, err
	}
	if _, err := h.Write(pub[:]); err != nil {
		return nil, err
	}
	if _, err := h.Write(recipient[:]); err != nil {
		return nil, err
	}
	nonceSlice := h.Sum(nil)
	if len(nonceSlice) != 24 {
		return nil, errors.New("unexpected nonce length")
	}
	var nonce [24]byte
	copy(nonce[:], nonceSlice)

	sealed := box.Seal(nil, plaintext, &nonce, &recipient, priv)

	out := make([]byte, boxPublicKeySize+len(sealed))
	copy(out[:boxPublicKeySize], pub[:])
	copy(out[boxPublicKeySize:], sealed)
	return out, nil
}
