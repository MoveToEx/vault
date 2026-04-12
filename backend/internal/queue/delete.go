package queue

import (
	"context"
	"errors"

	"backend/internal/config"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"github.com/riverqueue/river"
)

type DeleteArgs struct {
	Key string `json:"key,omitempty"`
}

func (DeleteArgs) Kind() string {
	return "s3_delete_file"
}

type DeleteWorker struct {
	river.WorkerDefaults[DeleteArgs]
}

func (w *DeleteWorker) Work(ctx context.Context, job *river.Job[DeleteArgs]) error {
	if err := deleteS3ObjectIfExists(ctx, job.Args.Key); err != nil {
		return err
	}
	return nil
}

func deleteS3ObjectIfExists(ctx context.Context, key string) error {
	bucket := config.GetConfig().S3.BucketName
	cli := config.S3()
	_, err := cli.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if isS3NotFound(err) {
			return nil
		}
		return err
	}
	_, err = cli.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	return err
}

func isS3NotFound(err error) bool {
	var ae smithy.APIError
	if !errors.As(err, &ae) {
		return false
	}
	switch ae.ErrorCode() {
	case "NotFound", "NoSuchKey":
		return true
	default:
		return false
	}
}
