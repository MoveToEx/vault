# Key Derivation

```mermaid
flowchart TB

pswd[User password]
umk[User master key]
fek[File encryption key]
kek[Key encryption key]
efek[Encrypted KEK]

pswd --Argon2id--> umk
umk --KDF--> kek
kek --AEAD--> efek
fek --AEAD--> efek

```

# Data encryption

```mermaid
flowchart TB

file[File content]
meta[File metadata]
fc[File cipher]
mc[Metadata cipher]

file --XChacha20(FEK, %)--> fc
meta --XChacha20(FEK, %)--> mc
```

# Storage

```
[24B: Nonce] [...: Cipher]
```

# Upload

```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant S3
    Client->>Server: Initiate
    Server->>Client: Upload ID
    Client->>Server: Get chunk
    Server->>Client: Signed chunk PUT url
    Client->>S3: Cipher chunk
    S3->>Client: Success
    Client->>Server: Complete chunk
    Server->>Client:
    Client->>Server: Complete upload
    Server->>Client:
```

# Share

```mermaid
sequenceDiagram
    participant Sender
    participant Server
    Sender->>Server: Request for file
    Server->>Sender: Encrypted file metadata + FEK
    Sender->>Server: Request for receiver
    Server->>Sender: Receiver public key
    Sender->>Sender: Decrypt file metdata and FEK
    Sender->>Sender: Encrypt file metadata and FEK with public key
    Sender->>Server: Encrypted FEK
```

```mermaid
sequenceDiagram
    participant Receiver
    participant Server
    Receiver->>Server: 
```