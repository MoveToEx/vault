package main

import (
	"crypto"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"log"
	"os"

	"github.com/bytemare/ksf"
	"github.com/bytemare/opaque"
)

func main() {
	env, err := os.Create(".env.keys")

	if err != nil {
		log.Fatalln("Failed when creating .env:", err)
		return
	}
	defer env.Close()

	{
		cfg := opaque.Configuration{
			OPRF:    opaque.P256Sha256,
			KDF:     crypto.SHA256,
			MAC:     crypto.SHA256,
			Hash:    crypto.SHA256,
			KSF:     ksf.Argon2id,
			AKE:     opaque.P256Sha256,
			Context: nil,
		}

		pri, pub := cfg.KeyGen()

		env.WriteString("OPAQUE_CONFIG=" + base64.StdEncoding.EncodeToString(cfg.Serialize()) + "\n")
		env.WriteString("OPAQUE_SERVER_ID=\n")
		env.WriteString("OPAQUE_OPRF_SEED=" + base64.StdEncoding.EncodeToString(cfg.GenerateOPRFSeed()) + "\n")
		env.WriteString("OPAQUE_SERVER_PRIVATE_KEY=" + base64.StdEncoding.EncodeToString(pri) + "\n")
		env.WriteString("OPAQUE_SERVER_PUBLIC_KEY=" + base64.StdEncoding.EncodeToString(pub) + "\n")
		env.WriteString("\n")
	}

	{
		pub, pri, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			log.Fatalln("Failed when generateing ed25519 key pair:", err)
			return
		}

		env.WriteString("JWT_PUBLIC_KEY=" + base64.StdEncoding.EncodeToString(pub) + "\n")
		env.WriteString("JWT_PRIVATE_KEY=" + base64.StdEncoding.EncodeToString(pri) + "\n")
		env.WriteString("\n")
	}

	log.Println("Generated env file at", env.Name())
}
