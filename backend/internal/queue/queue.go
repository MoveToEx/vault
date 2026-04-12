package queue

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
)

var client *river.Client[pgx.Tx]
var ctx context.Context

func Init(conn *pgxpool.Pool) error {
	workers := river.NewWorkers()

	if err := river.AddWorkerSafely(workers, &DeleteWorker{}); err != nil {
		return err
	}
	if err := river.AddWorkerSafely(workers, &ExpiryWorker{}); err != nil {
		return err
	}

	var err error

	client, err = river.NewClient(riverpgxv5.New(conn), &river.Config{
		Queues: map[string]river.QueueConfig{
			river.QueueDefault: {
				MaxWorkers: 100,
			},
		},
		Workers: workers,
		PeriodicJobs: []*river.PeriodicJob{
			river.NewPeriodicJob(
				river.PeriodicInterval(5*time.Minute),
				func() (river.JobArgs, *river.InsertOpts) {
					return ExpiryArgs{}, nil
				},
				&river.PeriodicJobOpts{
					ID:         "s3_expiry",
					RunOnStart: true,
				},
			),
		},
	})

	if err != nil {
		return err
	}

	ctx = context.Background()

	if err := client.Start(ctx); err != nil {
		return err
	}

	return nil
}

func Stop() error {
	return client.Stop(ctx)
}

func EnqueueS3Deletion(ctx context.Context, keys []string) error {
	for i := range keys {
		_, err := client.Insert(ctx, DeleteArgs{
			Key: keys[i],
		}, nil)
		if err != nil {
			return err
		}
	}
	return nil
}
