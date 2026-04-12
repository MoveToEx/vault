package permission

const (
	User  int64 = 1
	Admin int64 = 2
)

func IsAdmin(p int64) bool {
	return p == Admin
}
