package db

import (
	"context"
	"database/sql"
	"embed"

	_ "backend/internal/db/migrations"
	"backend/internal/sqlc"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pressly/goose/v3"
)

var conn *pgxpool.Pool

//go:embed migrations/*.sql
var migrations embed.FS

func Migrate(ctx context.Context, conn *sql.DB) error {
	goose.SetBaseFS(migrations)

	if err := goose.SetDialect("pgx"); err != nil {
		return err
	}

	return goose.UpContext(ctx, conn, "migrations")
}

func Init(pool *pgxpool.Pool) {
	conn = pool
}

func Query() *sqlc.Queries {
	return sqlc.New(conn)
}

func Transaction(ctx context.Context, f func(qtx *sqlc.Queries) error) error {
	tx, err := conn.Begin(ctx)

	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	qtx := Query().WithTx(tx)

	if err := f(qtx); err != nil {
		return err
	}

	return tx.Commit(ctx)
}
