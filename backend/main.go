package main

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/middleware"
	"backend/internal/route"
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
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

	db.Init(conn)

	if err := config.InitOpaque(); err != nil {
		log.Fatalln("Failed when initializingn OPAQUE: ", err)
		return
	}
	config.InitRedis()
	config.InitS3()

	app := gin.New()

	app.Use(gin.Recovery(), middleware.CORSMiddleware(config.GetConfig().CORSOrigin))

	route.SetupRoutes(app)

	srv := &http.Server{
		Addr:              ":8000",
		Handler:           app.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("Unable to serve: ", err)
		}
	}()

	<-ctx.Done()

	stop()
	log.Println("Shutting down")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Println("Server forced to shutdown: ", err)
	}
}
