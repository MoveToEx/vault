package db

import (
	"context"

	"backend/internal/sqlc"

	"github.com/jackc/pgx/v5/pgxpool"
)

var conn *pgxpool.Pool

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
