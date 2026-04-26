package main

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/middleware"
	"backend/internal/queue"
	"backend/internal/route"
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
)

func main() {
	config.LoadConfig()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	conn, err := pgxpool.New(ctx, config.GetConfig().DatabaseURL)

	if err != nil {
		log.Fatalln("Failed when connecting to database: ", err)
		return
	}

	if err := db.Migrate(ctx, stdlib.OpenDBFromPool(conn)); err != nil {
		log.Fatalln("Failed when applying migrations: ", err)
		return
	}

	db.Init(conn)

	if err := config.InitOpaque(); err != nil {
		log.Fatalln("Failed when initializing OPAQUE: ", err)
		return
	}
	config.InitRedis()
	config.InitS3()

	if err := queue.Init(conn); err != nil {
		log.Fatalln("Failed when starting job queue: ", err)
	}

	app := gin.New()

	log.Println("CORS: Origin =", config.GetConfig().AppBase)

	app.Use(gin.Recovery(), middleware.CORSMiddleware(config.GetConfig().AppBase))

	route.SetupRoutes(app)

	srv := &http.Server{
		Addr:        ":8000",
		Handler:     app.Handler(),
		ReadTimeout: 10 * time.Second,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("Unable to serve: ", err)
		}
	}()

	<-ctx.Done()

	stop()
	log.Println("Shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := queue.Stop(); err != nil {
		log.Println("Job queue shutdown: ", err)
	}

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Println("Server forced to shutdown: ", err)
	}
}
