/**
 * TypeScript Type Definitions for Backend Models
 * Based on BACKEND_ANALYSIS.md and backend/api/models.py
 * 
 * These types correspond to Django REST Framework serializer outputs
 */

// =====================================
// USER & AUTHENTICATION
// =====================================

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  date_of_birth?: string;
  city?: number;
  role?: 'athlete' | 'supporter' | 'admin';
  is_active: boolean;
  is_staff: boolean;
  date_joined: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
  first_name: string;
  last_name: string;
  role?: 'athlete' | 'supporter';
  phone_number?: string;
  date_of_birth?: string;
  city?: number;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

// =====================================
// ATHLETE
// =====================================

export interface Athlete {
  id: number;
  user?: number;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'M' | 'F';
  address?: string;
  mobile_number?: string;
  email?: string;
  club?: number;
  club_name?: string;
  city?: number;
  city_name?: string;
  grade?: number;
  grade_name?: string;
  title?: number;
  title_name?: string;
  federation_role?: number;
  federation_role_name?: string;
  profile_image?: string;
  medical_certificate?: string;
  previous_experience?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  approved_by?: number;
  approved_date?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'revision_requested';
  rejection_reason?: string;
  revision_notes?: string;
}

export interface AthleteActivity {
  id: number;
  athlete: number;
  performed_by: number;
  performed_by_name?: string;
  action: 'created' | 'updated' | 'approved' | 'rejected' | 'revision_requested' | 'grade_changed' | 'club_changed' | 'profile_updated';
  notes?: string;
  timestamp: string;
}

// =====================================
// REFERENCE DATA
// =====================================

export interface City {
  id: number;
  name: string;
  region?: string;
  country?: string;
}

export interface Club {
  id: number;
  name: string;
  address?: string;
  city?: number;
  city_name?: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  logo?: string;
  established_date?: string;
  is_active: boolean;
}

export interface Grade {
  id: number;
  name: string;
  level: number;
  color?: string;
  description?: string;
  requirements?: string;
}

export interface Title {
  id: number;
  name: string;
  abbreviation?: string;
  description?: string;
}

export interface FederationRole {
  id: number;
  name: string;
  description?: string;
  permissions?: string;
}

// =====================================
// COMPETITIONS & EVENTS
// =====================================

export interface Competition {
  id: number;
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  location?: string;
  city?: number;
  city_name?: string;
  type: 'tournament' | 'championship' | 'friendly' | 'seminar';
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  registration_deadline?: string;
  max_participants?: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  competition: number;
  competition_name?: string;
  name: string;
  gender?: 'M' | 'F' | 'mixed';
  min_age?: number;
  max_age?: number;
  min_grade?: number;
  max_grade?: number;
  weight_class?: string;
  type: 'individual' | 'team';
  max_participants?: number;
  description?: string;
}

export interface Group {
  id: number;
  category: number;
  category_name?: string;
  name: string;
  order: number;
}

export interface Match {
  id: number;
  category: number;
  round?: string;
  match_number?: number;
  athlete1?: number;
  athlete1_name?: string;
  athlete2?: number;
  athlete2_name?: string;
  team1?: number;
  team1_name?: string;
  team2?: number;
  team2_name?: string;
  winner?: number;
  score_athlete1?: number;
  score_athlete2?: number;
  scheduled_time?: string;
  actual_time?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
}

// =====================================
// TEAMS
// =====================================

export interface Team {
  id: number;
  name: string;
  club?: number;
  club_name?: string;
  coach?: number;
  coach_name?: string;
  members: number[];
  member_names?: string[];
  created_at: string;
}

export interface TeamMember {
  id: number;
  team: number;
  athlete: number;
  athlete_name?: string;
  position?: string;
  joined_date: string;
}

// =====================================
// SCORES & RESULTS
// =====================================

export interface CategoryAthleteScore {
  id: number;
  category: number;
  category_name?: string;
  athlete?: number;
  athlete_name?: string;
  team?: number;
  team_name?: string;
  placement: number;
  placement_claimed?: number;
  points?: number;
  notes?: string;
  is_verified: boolean;
  verified_by?: number;
  verified_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryScoreActivity {
  id: number;
  score: number;
  action: 'created' | 'updated' | 'verified' | 'deleted';
  performed_by: number;
  performed_by_name?: string;
  old_value?: string;
  new_value?: string;
  timestamp: string;
}

// =====================================
// GRADE HISTORY & VISAS
// =====================================

export interface GradeHistory {
  id: number;
  athlete: number;
  athlete_name?: string;
  previous_grade?: number;
  previous_grade_name?: string;
  new_grade: number;
  new_grade_name?: string;
  date_achieved: string;
  examiner?: string;
  location?: string;
  certificate_number?: string;
  notes?: string;
  status?: 'pending' | 'approved' | 'rejected';
  approved_by?: number;
  approved_date?: string;
}

export interface MedicalVisa {
  id: number;
  athlete: number;
  athlete_name?: string;
  issue_date: string;
  expiry_date: string;
  doctor_name?: string;
  medical_facility?: string;
  certificate_file?: string;
  notes?: string;
  is_valid: boolean;
}

export interface AnnualVisa {
  id: number;
  athlete: number;
  athlete_name?: string;
  year: number;
  issue_date: string;
  expiry_date: string;
  payment_confirmed: boolean;
  payment_amount?: number;
  payment_date?: string;
  notes?: string;
  admin_notes?: string;
  is_valid: boolean;
}

// =====================================
// TRAINING SEMINARS
// =====================================

export interface TrainingSeminar {
  id: number;
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  location?: string;
  city?: number;
  city_name?: string;
  instructor?: string;
  instructor_bio?: string;
  max_participants?: number;
  registration_deadline?: string;
  fee?: number;
  grade_requirements?: string;
  syllabus?: string;
  certificate_template?: string;
  is_published: boolean;
  created_at: string;
}

export interface TrainingSeminarParticipation {
  id: number;
  seminar: number;
  seminar_name?: string;
  athlete: number;
  athlete_name?: string;
  registration_date: string;
  attendance_confirmed: boolean;
  certificate_issued: boolean;
  certificate_file?: string;
  grade_awarded?: number;
  grade_awarded_name?: string;
  notes?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'revision_requested';
  approved_by?: number;
  approved_date?: string;
}

// =====================================
// SUPPORTER RELATIONSHIPS
// =====================================

export interface SupporterAthleteRelation {
  id: number;
  supporter: number;
  supporter_name?: string;
  athlete: number;
  athlete_name?: string;
  relationship_type: 'parent' | 'guardian' | 'coach' | 'other';
  can_view_profile: boolean;
  can_register_competitions: boolean;
  can_update_medical: boolean;
  start_date: string;
  end_date?: string;
  notes?: string;
  is_active: boolean;
}

// =====================================
// NOTIFICATIONS
// =====================================

export interface Notification {
  id: number;
  user: number;
  type: 'info' | 'success' | 'warning' | 'error' | 'approval_needed' | 'status_update';
  title: string;
  message: string;
  link?: string;
  is_read: boolean;
  created_at: string;
  read_at?: string;
}

export interface NotificationSettings {
  id: number;
  user: number;
  email_on_approval: boolean;
  email_on_rejection: boolean;
  email_on_grade_change: boolean;
  email_on_competition_registration: boolean;
  email_on_seminar_registration: boolean;
  email_on_result_update: boolean;
  push_notifications: boolean;
}

// =====================================
// PUBLIC CONTENT (Landing App)
// =====================================

export interface NewsPost {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  author: number;
  author_name?: string;
  featured_image?: string;
  category?: string;
  tags?: string[];
  is_published: boolean;
  publish_date: string;
  views_count: number;
  created_at: string;
  updated_at: string;
  meta_title?: string;
  meta_description?: string;
}

export interface NewsComment {
  id: number;
  post: number;
  author: number;
  author_name?: string;
  content: string;
  parent_comment?: number;
  is_approved: boolean;
  created_at: string;
}

export interface AboutSection {
  id: number;
  title: string;
  content: string;
  order: number;
  is_published: boolean;
  image?: string;
}

export interface ContactMessage {
  id: number;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  is_read: boolean;
  responded: boolean;
  created_at: string;
}

export interface ContactInfo {
  id: number;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  facebook?: string;
  twitter?: string;
  instagram?: string;
  linkedin?: string;
  working_hours?: string;
}

// =====================================
// API RESPONSE TYPES
// =====================================

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ErrorResponse {
  detail?: string;
  [key: string]: any;
}

export interface SuccessResponse {
  message: string;
  data?: any;
}

// =====================================
// FORM DATA TYPES
// =====================================

export interface AthleteFormData extends Partial<Athlete> {
  profile_image?: File;
  medical_certificate?: File;
}

export interface ClubFormData extends Partial<Club> {
  logo?: File;
}

export interface SeminarFormData extends Partial<TrainingSeminar> {
  certificate_template?: File;
}
