package crypto

import (
	"bytes"
	"testing"

	"golang.org/x/crypto/blake2b"
)

func TestCryptoKDFDeriveFromKey(t *testing.T) {
	key := make([]byte, CryptoKDFKeyBytes)
	for i := range key {
		key[i] = byte(i)
	}

	subkey, err := CryptoKDFDeriveFromKey(XChaCha20Poly1305NonceBytes, 0, "KEMNONCE", key)
	if err != nil {
		t.Fatal(err)
	}
	if len(subkey) != XChaCha20Poly1305NonceBytes {
		t.Fatalf("subkey length = %d, want %d", len(subkey), XChaCha20Poly1305NonceBytes)
	}

	again, err := CryptoKDFDeriveFromKey(XChaCha20Poly1305NonceBytes, 0, "KEMNONCE", key)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(subkey, again) {
		t.Fatal("same KDF inputs produced different outputs")
	}

	other, err := CryptoKDFDeriveFromKey(XChaCha20Poly1305NonceBytes, 1, "KEMNONCE", key)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(subkey, other) {
		t.Fatal("different subkey ids produced the same output")
	}
}

func TestCryptoKDFDeriveFromKeyRejectsInvalidInputs(t *testing.T) {
	key := make([]byte, CryptoKDFKeyBytes)

	if _, err := CryptoKDFDeriveFromKey(CryptoKDFBytesMin-1, 0, "KEMNONCE", key); err == nil {
		t.Fatal("accepted short output length")
	}
	if _, err := CryptoKDFDeriveFromKey(XChaCha20Poly1305NonceBytes, 0, "SHORT", key); err == nil {
		t.Fatal("accepted short context")
	}
	if _, err := CryptoKDFDeriveFromKey(XChaCha20Poly1305NonceBytes, 0, "KEMNONCE", key[:CryptoKDFKeyBytes-1]); err == nil {
		t.Fatal("accepted short key")
	}
}

func TestBlake2bKDFSumMatchesPlainKeyedBlake2b(t *testing.T) {
	key := make([]byte, CryptoKDFKeyBytes)
	for i := range key {
		key[i] = byte(i)
	}

	h, err := blake2b.New(XChaCha20Poly1305NonceBytes, key)
	if err != nil {
		t.Fatal(err)
	}
	var zeroSalt [16]byte
	var zeroPersonal [16]byte
	got := blake2bKDFSum(XChaCha20Poly1305NonceBytes, key, zeroSalt, zeroPersonal)
	want := h.Sum(nil)
	if !bytes.Equal(got, want) {
		t.Fatalf("got %x, want %x", got, want)
	}
}
