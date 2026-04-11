package crypto

import (
	"crypto/rand"
	"testing"

	"golang.org/x/crypto/blake2b"
	"golang.org/x/crypto/nacl/box"
)

func TestSealMessage_roundTrip(t *testing.T) {
	recipientPub, recipientPriv, err := box.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	plaintext := []byte(`{"action":"test","n":1}`)

	sealed, err := sealMessage(recipientPub[:], plaintext, rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	if len(sealed) < 32 {
		t.Fatal("sealed too short")
	}

	var ephemeralPub [32]byte
	copy(ephemeralPub[:], sealed[:32])
	ciphertext := sealed[32:]

	h, err := blake2b.New(24, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.Write(ephemeralPub[:]); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Write(recipientPub[:]); err != nil {
		t.Fatal(err)
	}
	var nonce [24]byte
	copy(nonce[:], h.Sum(nil))

	opened, ok := box.Open(nil, ciphertext, &nonce, &ephemeralPub, recipientPriv)
	if !ok {
		t.Fatal("box.Open failed")
	}
	if string(opened) != string(plaintext) {
		t.Fatalf("got %q want %q", opened, plaintext)
	}
}
