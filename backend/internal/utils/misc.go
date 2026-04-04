package utils

func GetChunkSize(size int64) int64 {
	if size < 64*1024*1024 {
		return 4 * 1024 * 1024
	} else if size < 512*1024*1024 {
		return 16 * 1024 * 1024
	}
	return 64 * 1024 * 1024
}

func GetEncryptedChunkSize(chunkSize int64) int64 {
	// cipher size = plain text size + authentication tag size(16)
	// chunk size = cipher size + nonce size(24)
	return chunkSize + 16 + 24
}
