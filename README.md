# Enclave

A web drive based on end-to-end encryption.  

## Deployment

### Using docker

```sh
$ git clone https://github.com/MoveToEx/enclave
$ cd enclave
$ cp .env.template .env
$ vim .env
$ docker compose up -d
```

### Manual

Requirements:
- Go 1.26.0 or later
- Node.js
- PostgreSQL
- Redis

```sh
$ # build backend
$ cd backend
$ cp .env.

```