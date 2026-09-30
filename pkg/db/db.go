package db

import (
	"log"
	"os"
	"path/filepath"
	"time"

	"shutterbox-system/pkg/models"

	"github.com/glebarez/sqlite"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func InitDB() (*gorm.DB, error) {
	// Create app data directory if needed
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "."
	}
	appDir := filepath.Join(homeDir, ".shutterbox")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		appDir = "."
	}

	dbPath := filepath.Join(appDir, "shutterbox.db")
	log.Printf("[DB] Initializing SQLite database at %s", dbPath)

	database, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}

	// Run Auto Migrations
	err = database.AutoMigrate(
		&models.User{},
		&models.Template{},
		&models.BoothLocation{},
		&models.Booking{},
		&models.QueueSession{},
		&models.Expense{},
	)
	if err != nil {
		return nil, err
	}

	DB = database
	SeedData(database)

	return database, nil
}

func SeedData(db *gorm.DB) {
	// Seed Admin User
	var userCount int64
	db.Model(&models.User{}).Count(&userCount)
	if userCount == 0 {
		hashedPass, _ := bcrypt.GenerateFromPassword([]byte("password"), bcrypt.DefaultCost)
		admin := models.User{
			Name:         "Shutterbox Admin",
			Email:        "admin@shutterbox.com",
			PasswordHash: string(hashedPass),
			Role:         "admin",
		}
		db.Create(&admin)
		log.Println("[Seed] Created default admin user: admin@shutterbox.com")
	}

	// Seed Default Templates
	var templateCount int64
	db.Model(&models.Template{}).Count(&templateCount)
	if templateCount == 0 {
		defaultTemplates := []models.Template{
			{Name: "Classic 4-Frame Vertical Strip", Code: "STRIP-4V", Category: "Classic", IsActive: true},
			{Name: "Retro Black & White 3-Strip", Code: "STRIP-3BW", Category: "Monochrome", IsActive: true},
			{Name: "Vintage Polaroid Grid", Code: "GRID-POLA", Category: "Vintage", IsActive: true},
			{Name: "Minimalist Pastel 2x2", Code: "PASTEL-2X2", Category: "Minimalist", IsActive: true},
			{Name: "Neon Party Frame", Code: "PARTY-NEON", Category: "Event Special", IsActive: true},
		}
		db.Create(&defaultTemplates)
		log.Println("[Seed] Created default photo strip templates")
	}

	// Seed Default Booth Location if none
	var boothCount int64
	db.Model(&models.BoothLocation{}).Count(&boothCount)
	if boothCount == 0 {
		now := time.Now()
		defaultBooth := models.BoothLocation{
			Name:      "SM Megamall Main Atrium Station",
			Address:   "EDSA corner Doña Julia Vargas Ave",
			City:      "Mandaluyong City",
			StartDate: now.AddDate(0, 0, -5),
			EndDate:   now.AddDate(0, 1, 0),
			RentFee:   15000.00,
			Status:    "active",
			Notes:     "Primary weekend pop-up photostrip booth",
		}
		db.Create(&defaultBooth)
		log.Println("[Seed] Created default booth location")
	}
}
