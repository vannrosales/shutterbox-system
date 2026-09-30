package models

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	Name         string         `gorm:"size:255;not null" json:"name"`
	Email        string         `gorm:"size:255;uniqueIndex;not null" json:"email"`
	PasswordHash string         `gorm:"size:255;not null" json:"-"`
	Role         string         `gorm:"size:50;default:'admin'" json:"role"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

type Template struct {
	ID         uint           `gorm:"primaryKey" json:"id"`
	Name       string         `gorm:"size:255;not null" json:"name"`
	Code       string         `gorm:"size:100;uniqueIndex;not null" json:"code"`
	Category   string         `gorm:"size:100;default:'Standard'" json:"category"`
	PreviewURL string         `gorm:"size:500" json:"preview_url"`
	IsActive   bool           `gorm:"default:true" json:"is_active"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`

	QueueSessionsCount int `gorm:"-" json:"queue_sessions_count,omitempty"`
}

type BoothLocation struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Name      string         `gorm:"size:255;not null" json:"name"`
	Address   string         `gorm:"size:255" json:"address"`
	City      string         `gorm:"size:100" json:"city"`
	StartDate time.Time      `json:"start_date"`
	EndDate   time.Time      `json:"end_date"`
	RentFee   float64        `gorm:"type:decimal(10,2);default:0.00" json:"rent_fee"`
	Status    string         `gorm:"size:50;default:'active'" json:"status"` // active, upcoming, completed
	Notes     string         `gorm:"type:text" json:"notes"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

type Booking struct {
	ID                 uint           `gorm:"primaryKey" json:"id"`
	BookingNumber      string         `gorm:"size:100;uniqueIndex;not null" json:"booking_number"`
	ClientName         string         `gorm:"size:255;not null" json:"client_name"`
	ClientPhone        string         `gorm:"size:100;not null" json:"client_phone"`
	ClientEmail        string         `gorm:"size:255" json:"client_email"`
	BoothLocationID    *uint          `json:"booth_location_id"`
	BoothLocation      *BoothLocation `gorm:"foreignKey:BoothLocationID" json:"booth_location,omitempty"`
	EventName          string         `gorm:"size:255;not null" json:"event_name"`
	EventDate          string         `gorm:"size:50;not null" json:"event_date"` // YYYY-MM-DD
	StartTime          string         `gorm:"size:50;default:'10:00'" json:"start_time"`
	EndTime            string         `gorm:"size:50;default:'18:00'" json:"end_time"`
	SessionsCount      int            `gorm:"default:1" json:"sessions_count"`
	ExtraCopies        int            `gorm:"default:0" json:"extra_copies"`
	BaseAmount         float64        `gorm:"type:decimal(10,2);default:0.00" json:"base_amount"`
	ExtraCopiesAmount  float64        `gorm:"type:decimal(10,2);default:0.00" json:"extra_copies_amount"`
	TotalAmount        float64        `gorm:"type:decimal(10,2);default:0.00" json:"total_amount"`
	DepositAmount      float64        `gorm:"type:decimal(10,2);default:0.00" json:"deposit_amount"`
	Status             string         `gorm:"size:50;default:'scheduled'" json:"status"` // scheduled, in_progress, completed, cancelled
	Notes              string         `gorm:"type:text" json:"notes"`
	Templates          []Template     `gorm:"many2many:booking_template;" json:"templates"`
	CreatedAt          time.Time      `json:"created_at"`
	UpdatedAt          time.Time      `json:"updated_at"`
	DeletedAt          gorm.DeletedAt `gorm:"index" json:"-"`
}

type QueueSession struct {
	ID                   uint           `gorm:"primaryKey" json:"id"`
	QueueNumber          string         `gorm:"size:50;not null" json:"queue_number"`
	CustomerName         string         `gorm:"size:255;default:'Walk-in Guest'" json:"customer_name"`
	BoothLocationID      *uint          `json:"booth_location_id"`
	BoothLocation        *BoothLocation `gorm:"foreignKey:BoothLocationID" json:"booth_location,omitempty"`
	SessionsCount        int            `gorm:"default:1" json:"sessions_count"`
	PhotostripsBaseCount int            `gorm:"default:2" json:"photostrips_base_count"`
	ExtraCopies          int            `gorm:"default:0" json:"extra_copies"`
	TotalPhotostrips     int            `gorm:"default:2" json:"total_photostrips"`
	BasePricePerSession  float64        `gorm:"type:decimal(10,2);default:200.00" json:"base_price_per_session"`
	BaseTotal            float64        `gorm:"type:decimal(10,2);default:200.00" json:"base_total"`
	ExtraCopiesPrice     float64        `gorm:"type:decimal(10,2);default:0.00" json:"extra_copies_price"`
	TotalPrice           float64        `gorm:"type:decimal(10,2);default:200.00" json:"total_price"`
	PaymentMethod        string         `gorm:"size:50;default:'cash'" json:"payment_method"` // cash, gcash, card, maya
	PaymentStatus        string         `gorm:"size:50;default:'paid'" json:"payment_status"` // paid, pending
	Status               string         `gorm:"size:50;default:'waiting'" json:"status"`     // waiting, in_booth, skipped, completed, cancelled, refunded
	Notes                string         `gorm:"type:text" json:"notes"`
	Templates            []Template     `gorm:"many2many:queue_session_template;" json:"templates"`
	CreatedAt            time.Time      `json:"created_at"`
	UpdatedAt            time.Time      `json:"updated_at"`
	DeletedAt            gorm.DeletedAt `gorm:"index" json:"-"`
}

type Expense struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	BoothLocationID *uint          `json:"booth_location_id"`
	BoothLocation   *BoothLocation `gorm:"foreignKey:BoothLocationID" json:"booth_location,omitempty"`
	Category        string         `gorm:"size:100;not null" json:"category"`
	Description     string         `gorm:"size:255;not null" json:"description"`
	Amount          float64        `gorm:"type:decimal(10,2);not null" json:"amount"`
	ExpenseDate     string         `gorm:"size:50;not null" json:"expense_date"` // YYYY-MM-DD
	ReceiptNumber   string         `gorm:"size:100" json:"receipt_number"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`
}

// Request and Response DTO Structs
type MetricData struct {
	TodayGrossSales float64 `json:"today_gross_sales"`
	TodaySessions   int     `json:"today_sessions"`
	TodayPhotostrips int    `json:"today_photostrips"`
	WaitingQueue    int     `json:"waiting_queue"`
	InBoothQueue    int     `json:"in_booth_queue"`
}

type DashboardData struct {
	Metrics          MetricData      `json:"metrics"`
	ActiveBooth      *BoothLocation  `json:"activeBooth"`
	TopTemplate      *Template       `json:"topTemplate"`
	RecentSessions   []QueueSession  `json:"recentSessions"`
	UpcomingBookings []Booking        `json:"upcomingBookings"`
}

type CreateQueueSessionInput struct {
	CustomerName        string  `json:"customer_name"`
	BoothLocationID     *uint   `json:"booth_location_id"`
	SessionsCount       int     `json:"sessions_count"`
	ExtraCopies         int     `json:"extra_copies"`
	BasePricePerSession float64 `json:"base_price_per_session"`
	PaymentMethod       string  `json:"payment_method"`
	PaymentStatus       string  `json:"payment_status"`
	Notes               string  `json:"notes"`
	TemplateIDs         []uint  `json:"template_ids"`
}

type CreateBoothLocationInput struct {
	Name      string  `json:"name"`
	Address   string  `json:"address"`
	City      string  `json:"city"`
	StartDate string  `json:"start_date"`
	EndDate   string  `json:"end_date"`
	RentFee   float64 `json:"rent_fee"`
	Notes     string  `json:"notes"`
}

type CreateBookingInput struct {
	ClientName      string  `json:"client_name"`
	ClientPhone     string  `json:"client_phone"`
	ClientEmail     string  `json:"client_email"`
	BoothLocationID *uint   `json:"booth_location_id"`
	EventName       string  `json:"event_name"`
	EventDate       string  `json:"event_date"`
	StartTime       string  `json:"start_time"`
	EndTime         string  `json:"end_time"`
	SessionsCount   int     `json:"sessions_count"`
	ExtraCopies     int     `json:"extra_copies"`
	BaseAmount      float64 `json:"base_amount"`
	DepositAmount   float64 `json:"deposit_amount"`
	Notes           string  `json:"notes"`
	TemplateIDs     []uint  `json:"template_ids"`
}

type CreateExpenseInput struct {
	BoothLocationID *uint   `json:"booth_location_id"`
	Category        string  `json:"category"`
	Description     string  `json:"description"`
	Amount          float64 `json:"amount"`
	ExpenseDate     string  `json:"expense_date"`
	ReceiptNumber   string  `json:"receipt_number"`
}

type CreateTemplateInput struct {
	Name       string `json:"name"`
	Code       string `json:"code"`
	Category   string `json:"category"`
	PreviewURL string `json:"preview_url"`
}

type TodayStats struct {
	TotalQueue     int `json:"total_queue"`
	CompletedToday int `json:"completed_today"`
	WaitingNow     int `json:"waiting_now"`
	InBoothNow     int `json:"in_booth_now"`
}
