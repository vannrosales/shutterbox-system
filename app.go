package main

import (
	"context"
	"fmt"
	"time"

	"shutterbox-system/pkg/db"
	"shutterbox-system/pkg/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type App struct {
	ctx         context.Context
	db          *gorm.DB
	currentUser *models.User
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	database, err := db.InitDB()
	if err != nil {
		fmt.Printf("Error initializing database: %v\n", err)
	} else {
		a.db = database
	}
}

// --- AUTHENTICATION SERVICES ---

func (a *App) Login(email, password string) (*models.User, error) {
	var user models.User
	if err := a.db.Where("email = ?", email).First(&user).Error; err != nil {
		return nil, fmt.Errorf("invalid email or password")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, fmt.Errorf("invalid email or password")
	}

	a.currentUser = &user
	return &user, nil
}

func (a *App) Register(name, email, password string) (*models.User, error) {
	var count int64
	a.db.Model(&models.User{}).Where("email = ?", email).Count(&count)
	if count > 0 {
		return nil, fmt.Errorf("email address already registered")
	}

	hashedPass, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to process password")
	}

	newUser := models.User{
		Name:         name,
		Email:        email,
		PasswordHash: string(hashedPass),
		Role:         "admin",
	}

	if err := a.db.Create(&newUser).Error; err != nil {
		return nil, fmt.Errorf("failed to create user")
	}

	a.currentUser = &newUser
	return &newUser, nil
}

func (a *App) GetCurrentUser() *models.User {
	if a.currentUser == nil {
		// Fallback to first user in DB if present for quick auto-auth
		var user models.User
		if err := a.db.First(&user).Error; err == nil {
			a.currentUser = &user
		}
	}
	return a.currentUser
}

func (a *App) Logout() bool {
	a.currentUser = nil
	return true
}

func (a *App) UpdateProfile(name, email string) (*models.User, error) {
	user := a.GetCurrentUser()
	if user == nil {
		return nil, fmt.Errorf("not authenticated")
	}

	user.Name = name
	user.Email = email
	if err := a.db.Save(user).Error; err != nil {
		return nil, fmt.Errorf("failed to update profile")
	}

	a.currentUser = user
	return user, nil
}

func (a *App) UpdatePassword(currentPassword, newPassword string) (bool, error) {
	user := a.GetCurrentUser()
	if user == nil {
		return false, fmt.Errorf("not authenticated")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(currentPassword)); err != nil {
		return false, fmt.Errorf("incorrect current password")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return false, fmt.Errorf("failed to process new password")
	}

	user.PasswordHash = string(hashed)
	if err := a.db.Save(user).Error; err != nil {
		return false, fmt.Errorf("failed to update password")
	}

	return true, nil
}

// --- DASHBOARD SERVICES ---

func (a *App) GetDashboardData() (*models.DashboardData, error) {
	today := time.Now().Format("2006-01-02")
	var sessions []models.QueueSession
	a.db.Preload("Templates").
		Where("DATE(created_at) = ?", today).
		Order("id desc").
		Find(&sessions)

	var todayGross float64
	var todaySessionsCount int
	var todayPhotostripsCount int
	var waitingCount int
	var inBoothCount int

	for _, s := range sessions {
		if s.Status != "cancelled" && s.Status != "refunded" {
			todayGross += s.TotalPrice
			todaySessionsCount++
			todayPhotostripsCount += s.TotalPhotostrips
		}
		if s.Status == "waiting" {
			waitingCount++
		} else if s.Status == "in_booth" {
			inBoothCount++
		}
	}

	// Active Booth Location
	var activeBooth models.BoothLocation
	var activeBoothPtr *models.BoothLocation
	if err := a.db.Where("status = ?", "active").First(&activeBooth).Error; err == nil {
		activeBoothPtr = &activeBooth
	}

	// Top Template
	var topTemplate models.Template
	var topTemplatePtr *models.Template
	if err := a.db.First(&topTemplate).Error; err == nil {
		var sessionCount int64
		a.db.Table("queue_session_template").Where("template_id = ?", topTemplate.ID).Count(&sessionCount)
		topTemplate.QueueSessionsCount = int(sessionCount)
		topTemplatePtr = &topTemplate
	}

	// Recent Sessions
	var recentSessions []models.QueueSession
	a.db.Preload("Templates").Order("id desc").Limit(5).Find(&recentSessions)

	// Upcoming Bookings
	var upcomingBookings []models.Booking
	a.db.Preload("BoothLocation").
		Where("status IN ?", []string{"scheduled", "in_progress"}).
		Order("event_date asc").
		Limit(5).
		Find(&upcomingBookings)

	data := &models.DashboardData{
		Metrics: models.MetricData{
			TodayGrossSales:  todayGross,
			TodaySessions:    todaySessionsCount,
			TodayPhotostrips: todayPhotostripsCount,
			WaitingQueue:     waitingCount,
			InBoothQueue:     inBoothCount,
		},
		ActiveBooth:      activeBoothPtr,
		TopTemplate:      topTemplatePtr,
		RecentSessions:   recentSessions,
		UpcomingBookings: upcomingBookings,
	}

	return data, nil
}

// --- QUEUING POS SERVICES ---

func (a *App) GetQueueSessions() ([]models.QueueSession, error) {
	var sessions []models.QueueSession
	err := a.db.Preload("Templates").Preload("BoothLocation").Order("id desc").Find(&sessions).Error
	return sessions, err
}

func (a *App) GetTodayQueueStats() (*models.TodayStats, error) {
	today := time.Now().Format("2006-01-02")
	var total int64
	var completed int64
	var waiting int64
	var inBooth int64

	a.db.Model(&models.QueueSession{}).Where("DATE(created_at) = ?", today).Count(&total)
	a.db.Model(&models.QueueSession{}).Where("DATE(created_at) = ? AND status = ?", today, "completed").Count(&completed)
	a.db.Model(&models.QueueSession{}).Where("status = ?", "waiting").Count(&waiting)
	a.db.Model(&models.QueueSession{}).Where("status = ?", "in_booth").Count(&inBooth)

	return &models.TodayStats{
		TotalQueue:     int(total),
		CompletedToday: int(completed),
		WaitingNow:     int(waiting),
		InBoothNow:     int(inBooth),
	}, nil
}

func (a *App) CreateQueueSession(input models.CreateQueueSessionInput) (*models.QueueSession, error) {
	var count int64
	today := time.Now().Format("2006-01-02")
	a.db.Model(&models.QueueSession{}).Where("DATE(created_at) = ?", today).Count(&count)
	queueNumber := fmt.Sprintf("SB-%03d", count+1)

	basePrice := input.BasePricePerSession
	if basePrice <= 0 {
		basePrice = 200.00
	}
	sessionsCount := input.SessionsCount
	if sessionsCount <= 0 {
		sessionsCount = 1
	}

	baseTotal := float64(sessionsCount) * basePrice
	extraCopies := input.ExtraCopies
	extraCopiesPrice := float64(extraCopies) * 100.00
	totalPrice := baseTotal + extraCopiesPrice

	photostripsBaseCount := sessionsCount * 2
	totalPhotostrips := photostripsBaseCount + extraCopies

	customerName := input.CustomerName
	if customerName == "" {
		customerName = "Walk-in Guest"
	}

	session := models.QueueSession{
		QueueNumber:          queueNumber,
		CustomerName:         customerName,
		BoothLocationID:      input.BoothLocationID,
		SessionsCount:        sessionsCount,
		PhotostripsBaseCount: photostripsBaseCount,
		ExtraCopies:          extraCopies,
		TotalPhotostrips:     totalPhotostrips,
		BasePricePerSession:  basePrice,
		BaseTotal:            baseTotal,
		ExtraCopiesPrice:     extraCopiesPrice,
		TotalPrice:           totalPrice,
		PaymentMethod:        input.PaymentMethod,
		PaymentStatus:        input.PaymentStatus,
		Status:               "waiting",
		Notes:                input.Notes,
	}

	if err := a.db.Create(&session).Error; err != nil {
		return nil, err
	}

	if len(input.TemplateIDs) > 0 {
		var templates []models.Template
		a.db.Where("id IN ?", input.TemplateIDs).Find(&templates)
		a.db.Model(&session).Association("Templates").Replace(templates)
	}

	var result models.QueueSession
	a.db.Preload("Templates").Preload("BoothLocation").First(&result, session.ID)
	return &result, nil
}

func (a *App) UpdateQueueSessionStatus(id uint, status string) (*models.QueueSession, error) {
	var session models.QueueSession
	if err := a.db.First(&session, id).Error; err != nil {
		return nil, err
	}

	session.Status = status
	if err := a.db.Save(&session).Error; err != nil {
		return nil, err
	}

	var result models.QueueSession
	a.db.Preload("Templates").Preload("BoothLocation").First(&result, id)
	return &result, nil
}

func (a *App) UpdateQueueSession(id uint, input models.CreateQueueSessionInput) (*models.QueueSession, error) {
	var session models.QueueSession
	if err := a.db.First(&session, id).Error; err != nil {
		return nil, err
	}

	basePrice := input.BasePricePerSession
	if basePrice <= 0 {
		basePrice = session.BasePricePerSession
	}
	sessionsCount := input.SessionsCount
	if sessionsCount <= 0 {
		sessionsCount = 1
	}

	baseTotal := float64(sessionsCount) * basePrice
	extraCopies := input.ExtraCopies
	extraCopiesPrice := float64(extraCopies) * 100.00
	totalPrice := baseTotal + extraCopiesPrice

	photostripsBaseCount := sessionsCount * 2
	totalPhotostrips := photostripsBaseCount + extraCopies

	session.CustomerName = input.CustomerName
	session.BoothLocationID = input.BoothLocationID
	session.SessionsCount = sessionsCount
	session.PhotostripsBaseCount = photostripsBaseCount
	session.ExtraCopies = extraCopies
	session.TotalPhotostrips = totalPhotostrips
	session.BasePricePerSession = basePrice
	session.BaseTotal = baseTotal
	session.ExtraCopiesPrice = extraCopiesPrice
	session.TotalPrice = totalPrice
	session.PaymentMethod = input.PaymentMethod
	session.PaymentStatus = input.PaymentStatus
	session.Notes = input.Notes

	if err := a.db.Save(&session).Error; err != nil {
		return nil, err
	}

	if len(input.TemplateIDs) > 0 {
		var templates []models.Template
		a.db.Where("id IN ?", input.TemplateIDs).Find(&templates)
		a.db.Model(&session).Association("Templates").Replace(templates)
	}

	var result models.QueueSession
	a.db.Preload("Templates").Preload("BoothLocation").First(&result, id)
	return &result, nil
}

func (a *App) DeleteQueueSession(id uint) (bool, error) {
	if err := a.db.Delete(&models.QueueSession{}, id).Error; err != nil {
		return false, err
	}
	return true, nil
}

// --- BOOTH LOCATIONS & EVENTS SERVICES ---

func (a *App) GetBoothLocations() ([]models.BoothLocation, error) {
	var locations []models.BoothLocation
	err := a.db.Order("id desc").Find(&locations).Error
	return locations, err
}

func (a *App) CreateBoothLocation(input models.CreateBoothLocationInput) (*models.BoothLocation, error) {
	startDate, _ := time.Parse("2006-01-02", input.StartDate)
	endDate, _ := time.Parse("2006-01-02", input.EndDate)
	if startDate.IsZero() {
		startDate = time.Now()
	}
	if endDate.IsZero() {
		endDate = startDate.AddDate(0, 1, 0)
	}

	booth := models.BoothLocation{
		Name:      input.Name,
		Address:   input.Address,
		City:      input.City,
		StartDate: startDate,
		EndDate:   endDate,
		RentFee:   input.RentFee,
		Status:    "active",
		Notes:     input.Notes,
	}

	if err := a.db.Create(&booth).Error; err != nil {
		return nil, err
	}
	return &booth, nil
}

func (a *App) UpdateBoothLocation(id uint, input models.CreateBoothLocationInput) (*models.BoothLocation, error) {
	var booth models.BoothLocation
	if err := a.db.First(&booth, id).Error; err != nil {
		return nil, err
	}

	startDate, _ := time.Parse("2006-01-02", input.StartDate)
	endDate, _ := time.Parse("2006-01-02", input.EndDate)

	booth.Name = input.Name
	booth.Address = input.Address
	booth.City = input.City
	if !startDate.IsZero() {
		booth.StartDate = startDate
	}
	if !endDate.IsZero() {
		booth.EndDate = endDate
	}
	booth.RentFee = input.RentFee
	booth.Notes = input.Notes

	if err := a.db.Save(&booth).Error; err != nil {
		return nil, err
	}
	return &booth, nil
}

func (a *App) ToggleBoothStatus(id uint) (*models.BoothLocation, error) {
	var booth models.BoothLocation
	if err := a.db.First(&booth, id).Error; err != nil {
		return nil, err
	}

	if booth.Status == "active" {
		booth.Status = "completed"
	} else {
		booth.Status = "active"
	}

	if err := a.db.Save(&booth).Error; err != nil {
		return nil, err
	}
	return &booth, nil
}

func (a *App) DeleteBoothLocation(id uint) (bool, error) {
	if err := a.db.Delete(&models.BoothLocation{}, id).Error; err != nil {
		return false, err
	}
	return true, nil
}

// --- BOOKINGS & CALENDAR SERVICES ---

func (a *App) GetBookings() ([]models.Booking, error) {
	var bookings []models.Booking
	err := a.db.Preload("Templates").Preload("BoothLocation").Order("event_date asc").Find(&bookings).Error
	return bookings, err
}

func (a *App) CreateBooking(input models.CreateBookingInput) (*models.Booking, error) {
	var count int64
	a.db.Model(&models.Booking{}).Count(&count)
	bookingNumber := fmt.Sprintf("BKG-%04d", count+1)

	baseAmount := input.BaseAmount
	extraCopiesAmount := float64(input.ExtraCopies) * 100.00
	totalAmount := baseAmount + extraCopiesAmount

	booking := models.Booking{
		BookingNumber:     bookingNumber,
		ClientName:        input.ClientName,
		ClientPhone:       input.ClientPhone,
		ClientEmail:       input.ClientEmail,
		BoothLocationID:   input.BoothLocationID,
		EventName:         input.EventName,
		EventDate:         input.EventDate,
		StartTime:         input.StartTime,
		EndTime:           input.EndTime,
		SessionsCount:     input.SessionsCount,
		ExtraCopies:       input.ExtraCopies,
		BaseAmount:        baseAmount,
		ExtraCopiesAmount: extraCopiesAmount,
		TotalAmount:       totalAmount,
		DepositAmount:     input.DepositAmount,
		Status:            "scheduled",
		Notes:             input.Notes,
	}

	if err := a.db.Create(&booking).Error; err != nil {
		return nil, err
	}

	if len(input.TemplateIDs) > 0 {
		var templates []models.Template
		a.db.Where("id IN ?", input.TemplateIDs).Find(&templates)
		a.db.Model(&booking).Association("Templates").Replace(templates)
	}

	var result models.Booking
	a.db.Preload("Templates").Preload("BoothLocation").First(&result, booking.ID)
	return &result, nil
}

func (a *App) UpdateBookingStatus(id uint, status string) (*models.Booking, error) {
	var booking models.Booking
	if err := a.db.First(&booking, id).Error; err != nil {
		return nil, err
	}

	booking.Status = status
	if err := a.db.Save(&booking).Error; err != nil {
		return nil, err
	}

	var result models.Booking
	a.db.Preload("Templates").Preload("BoothLocation").First(&result, id)
	return &result, nil
}

func (a *App) DeleteBooking(id uint) (bool, error) {
	if err := a.db.Delete(&models.Booking{}, id).Error; err != nil {
		return false, err
	}
	return true, nil
}

// --- FINANCIAL TRACKER SERVICES ---

func (a *App) GetExpenses() ([]models.Expense, error) {
	var expenses []models.Expense
	err := a.db.Preload("BoothLocation").Order("expense_date desc").Find(&expenses).Error
	return expenses, err
}

func (a *App) CreateExpense(input models.CreateExpenseInput) (*models.Expense, error) {
	expenseDate := input.ExpenseDate
	if expenseDate == "" {
		expenseDate = time.Now().Format("2006-01-02")
	}

	expense := models.Expense{
		BoothLocationID: input.BoothLocationID,
		Category:        input.Category,
		Description:     input.Description,
		Amount:          input.Amount,
		ExpenseDate:     expenseDate,
		ReceiptNumber:   input.ReceiptNumber,
	}

	if err := a.db.Create(&expense).Error; err != nil {
		return nil, err
	}

	var result models.Expense
	a.db.Preload("BoothLocation").First(&result, expense.ID)
	return &result, nil
}

func (a *App) DeleteExpense(id uint) (bool, error) {
	if err := a.db.Delete(&models.Expense{}, id).Error; err != nil {
		return false, err
	}
	return true, nil
}

// --- TEMPLATE SERVICES ---

func (a *App) GetTemplates() ([]models.Template, error) {
	var templates []models.Template
	a.db.Order("id asc").Find(&templates)

	for i := range templates {
		var count int64
		a.db.Table("queue_session_template").Where("template_id = ?", templates[i].ID).Count(&count)
		templates[i].QueueSessionsCount = int(count)
	}

	return templates, nil
}

func (a *App) CreateTemplate(input models.CreateTemplateInput) (*models.Template, error) {
	tmpl := models.Template{
		Name:       input.Name,
		Code:       input.Code,
		Category:   input.Category,
		PreviewURL: input.PreviewURL,
		IsActive:   true,
	}

	if err := a.db.Create(&tmpl).Error; err != nil {
		return nil, err
	}
	return &tmpl, nil
}

func (a *App) ToggleTemplate(id uint) (*models.Template, error) {
	var tmpl models.Template
	if err := a.db.First(&tmpl, id).Error; err != nil {
		return nil, err
	}

	tmpl.IsActive = !tmpl.IsActive
	if err := a.db.Save(&tmpl).Error; err != nil {
		return nil, err
	}
	return &tmpl, nil
}
