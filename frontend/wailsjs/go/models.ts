export namespace gorm {
	
	export class DeletedAt {
	    // Go type: time
	    Time: any;
	    Valid: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DeletedAt(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Time = this.convertValues(source["Time"], null);
	        this.Valid = source["Valid"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace models {
	
	export class Template {
	    id: number;
	    name: string;
	    code: string;
	    category: string;
	    preview_url: string;
	    is_active: boolean;
	    // Go type: time
	    created_at: any;
	    // Go type: time
	    updated_at: any;
	    queue_sessions_count?: number;
	
	    static createFrom(source: any = {}) {
	        return new Template(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.code = source["code"];
	        this.category = source["category"];
	        this.preview_url = source["preview_url"];
	        this.is_active = source["is_active"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.updated_at = this.convertValues(source["updated_at"], null);
	        this.queue_sessions_count = source["queue_sessions_count"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BoothLocation {
	    id: number;
	    name: string;
	    address: string;
	    city: string;
	    // Go type: time
	    start_date: any;
	    // Go type: time
	    end_date: any;
	    rent_fee: number;
	    status: string;
	    notes: string;
	    // Go type: time
	    created_at: any;
	    // Go type: time
	    updated_at: any;
	
	    static createFrom(source: any = {}) {
	        return new BoothLocation(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.address = source["address"];
	        this.city = source["city"];
	        this.start_date = this.convertValues(source["start_date"], null);
	        this.end_date = this.convertValues(source["end_date"], null);
	        this.rent_fee = source["rent_fee"];
	        this.status = source["status"];
	        this.notes = source["notes"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.updated_at = this.convertValues(source["updated_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Booking {
	    id: number;
	    booking_number: string;
	    client_name: string;
	    client_phone: string;
	    client_email: string;
	    booth_location_id?: number;
	    booth_location?: BoothLocation;
	    event_name: string;
	    event_date: string;
	    start_time: string;
	    end_time: string;
	    sessions_count: number;
	    extra_copies: number;
	    base_amount: number;
	    extra_copies_amount: number;
	    total_amount: number;
	    deposit_amount: number;
	    status: string;
	    notes: string;
	    templates: Template[];
	    // Go type: time
	    created_at: any;
	    // Go type: time
	    updated_at: any;
	
	    static createFrom(source: any = {}) {
	        return new Booking(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.booking_number = source["booking_number"];
	        this.client_name = source["client_name"];
	        this.client_phone = source["client_phone"];
	        this.client_email = source["client_email"];
	        this.booth_location_id = source["booth_location_id"];
	        this.booth_location = this.convertValues(source["booth_location"], BoothLocation);
	        this.event_name = source["event_name"];
	        this.event_date = source["event_date"];
	        this.start_time = source["start_time"];
	        this.end_time = source["end_time"];
	        this.sessions_count = source["sessions_count"];
	        this.extra_copies = source["extra_copies"];
	        this.base_amount = source["base_amount"];
	        this.extra_copies_amount = source["extra_copies_amount"];
	        this.total_amount = source["total_amount"];
	        this.deposit_amount = source["deposit_amount"];
	        this.status = source["status"];
	        this.notes = source["notes"];
	        this.templates = this.convertValues(source["templates"], Template);
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.updated_at = this.convertValues(source["updated_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class CreateBookingInput {
	    client_name: string;
	    client_phone: string;
	    client_email: string;
	    booth_location_id?: number;
	    event_name: string;
	    event_date: string;
	    start_time: string;
	    end_time: string;
	    sessions_count: number;
	    extra_copies: number;
	    base_amount: number;
	    deposit_amount: number;
	    notes: string;
	    template_ids: number[];
	
	    static createFrom(source: any = {}) {
	        return new CreateBookingInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.client_name = source["client_name"];
	        this.client_phone = source["client_phone"];
	        this.client_email = source["client_email"];
	        this.booth_location_id = source["booth_location_id"];
	        this.event_name = source["event_name"];
	        this.event_date = source["event_date"];
	        this.start_time = source["start_time"];
	        this.end_time = source["end_time"];
	        this.sessions_count = source["sessions_count"];
	        this.extra_copies = source["extra_copies"];
	        this.base_amount = source["base_amount"];
	        this.deposit_amount = source["deposit_amount"];
	        this.notes = source["notes"];
	        this.template_ids = source["template_ids"];
	    }
	}
	export class CreateBoothLocationInput {
	    name: string;
	    address: string;
	    city: string;
	    start_date: string;
	    end_date: string;
	    rent_fee: number;
	    notes: string;
	
	    static createFrom(source: any = {}) {
	        return new CreateBoothLocationInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.address = source["address"];
	        this.city = source["city"];
	        this.start_date = source["start_date"];
	        this.end_date = source["end_date"];
	        this.rent_fee = source["rent_fee"];
	        this.notes = source["notes"];
	    }
	}
	export class CreateExpenseInput {
	    booth_location_id?: number;
	    category: string;
	    description: string;
	    amount: number;
	    expense_date: string;
	    receipt_number: string;
	
	    static createFrom(source: any = {}) {
	        return new CreateExpenseInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.booth_location_id = source["booth_location_id"];
	        this.category = source["category"];
	        this.description = source["description"];
	        this.amount = source["amount"];
	        this.expense_date = source["expense_date"];
	        this.receipt_number = source["receipt_number"];
	    }
	}
	export class CreateQueueSessionInput {
	    customer_name: string;
	    booth_location_id?: number;
	    sessions_count: number;
	    extra_copies: number;
	    base_price_per_session: number;
	    payment_method: string;
	    payment_status: string;
	    notes: string;
	    template_ids: number[];
	
	    static createFrom(source: any = {}) {
	        return new CreateQueueSessionInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.customer_name = source["customer_name"];
	        this.booth_location_id = source["booth_location_id"];
	        this.sessions_count = source["sessions_count"];
	        this.extra_copies = source["extra_copies"];
	        this.base_price_per_session = source["base_price_per_session"];
	        this.payment_method = source["payment_method"];
	        this.payment_status = source["payment_status"];
	        this.notes = source["notes"];
	        this.template_ids = source["template_ids"];
	    }
	}
	export class CreateTemplateInput {
	    name: string;
	    code: string;
	    category: string;
	    preview_url: string;
	
	    static createFrom(source: any = {}) {
	        return new CreateTemplateInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.code = source["code"];
	        this.category = source["category"];
	        this.preview_url = source["preview_url"];
	    }
	}
	export class QueueSession {
	    id: number;
	    queue_number: string;
	    customer_name: string;
	    booth_location_id?: number;
	    booth_location?: BoothLocation;
	    sessions_count: number;
	    photostrips_base_count: number;
	    extra_copies: number;
	    total_photostrips: number;
	    base_price_per_session: number;
	    base_total: number;
	    extra_copies_price: number;
	    total_price: number;
	    payment_method: string;
	    payment_status: string;
	    status: string;
	    notes: string;
	    templates: Template[];
	    // Go type: time
	    created_at: any;
	    // Go type: time
	    updated_at: any;
	
	    static createFrom(source: any = {}) {
	        return new QueueSession(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.queue_number = source["queue_number"];
	        this.customer_name = source["customer_name"];
	        this.booth_location_id = source["booth_location_id"];
	        this.booth_location = this.convertValues(source["booth_location"], BoothLocation);
	        this.sessions_count = source["sessions_count"];
	        this.photostrips_base_count = source["photostrips_base_count"];
	        this.extra_copies = source["extra_copies"];
	        this.total_photostrips = source["total_photostrips"];
	        this.base_price_per_session = source["base_price_per_session"];
	        this.base_total = source["base_total"];
	        this.extra_copies_price = source["extra_copies_price"];
	        this.total_price = source["total_price"];
	        this.payment_method = source["payment_method"];
	        this.payment_status = source["payment_status"];
	        this.status = source["status"];
	        this.notes = source["notes"];
	        this.templates = this.convertValues(source["templates"], Template);
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.updated_at = this.convertValues(source["updated_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MetricData {
	    today_gross_sales: number;
	    today_sessions: number;
	    today_photostrips: number;
	    waiting_queue: number;
	    in_booth_queue: number;
	
	    static createFrom(source: any = {}) {
	        return new MetricData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.today_gross_sales = source["today_gross_sales"];
	        this.today_sessions = source["today_sessions"];
	        this.today_photostrips = source["today_photostrips"];
	        this.waiting_queue = source["waiting_queue"];
	        this.in_booth_queue = source["in_booth_queue"];
	    }
	}
	export class DashboardData {
	    metrics: MetricData;
	    activeBooth?: BoothLocation;
	    topTemplate?: Template;
	    recentSessions: QueueSession[];
	    upcomingBookings: Booking[];
	
	    static createFrom(source: any = {}) {
	        return new DashboardData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.metrics = this.convertValues(source["metrics"], MetricData);
	        this.activeBooth = this.convertValues(source["activeBooth"], BoothLocation);
	        this.topTemplate = this.convertValues(source["topTemplate"], Template);
	        this.recentSessions = this.convertValues(source["recentSessions"], QueueSession);
	        this.upcomingBookings = this.convertValues(source["upcomingBookings"], Booking);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Expense {
	    id: number;
	    booth_location_id?: number;
	    booth_location?: BoothLocation;
	    category: string;
	    description: string;
	    amount: number;
	    expense_date: string;
	    receipt_number: string;
	    // Go type: time
	    created_at: any;
	    // Go type: time
	    updated_at: any;
	
	    static createFrom(source: any = {}) {
	        return new Expense(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.booth_location_id = source["booth_location_id"];
	        this.booth_location = this.convertValues(source["booth_location"], BoothLocation);
	        this.category = source["category"];
	        this.description = source["description"];
	        this.amount = source["amount"];
	        this.expense_date = source["expense_date"];
	        this.receipt_number = source["receipt_number"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.updated_at = this.convertValues(source["updated_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class TodayStats {
	    total_queue: number;
	    completed_today: number;
	    waiting_now: number;
	    in_booth_now: number;
	
	    static createFrom(source: any = {}) {
	        return new TodayStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total_queue = source["total_queue"];
	        this.completed_today = source["completed_today"];
	        this.waiting_now = source["waiting_now"];
	        this.in_booth_now = source["in_booth_now"];
	    }
	}
	export class User {
	    id: number;
	    name: string;
	    email: string;
	    role: string;
	    // Go type: time
	    created_at: any;
	    // Go type: time
	    updated_at: any;
	
	    static createFrom(source: any = {}) {
	        return new User(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.email = source["email"];
	        this.role = source["role"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.updated_at = this.convertValues(source["updated_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

