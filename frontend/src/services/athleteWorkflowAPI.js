// API Service for Athlete Registration and Approval Workflow
import AxiosInstance from '../components/Axios';

class AthleteWorkflowAPI {
  // =====================================
  // USER AUTHENTICATION & REGISTRATION
  // =====================================

  /**
   * Register new user with role selection
   * @param {Object} userData - User registration data
   * @param {string} userData.username - Username
   * @param {string} userData.email - Email address
   * @param {string} userData.password - Password
   * @param {string} userData.password_confirm - Password confirmation
   * @param {string} userData.first_name - First name
   * @param {string} userData.last_name - Last name
   * @param {string} userData.role - User role ('athlete' or 'supporter')
   * @param {string} userData.phone_number - Phone number (optional)
   * @param {string} userData.date_of_birth - Date of birth (optional)
   * @param {number} userData.city - City ID (optional)
   * @returns {Promise} Registration response with user data and tokens
   */
  static async registerUser(userData) {
    try {
      const response = await AxiosInstance.post('/auth/register-enhanced/', userData);
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Get enhanced user profile with role information
   * @returns {Promise} User profile data
   */
  static async getUserProfile() {
    try {
      const response = await AxiosInstance.get('/auth/profile-enhanced/');
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Update user profile
   * @param {Object} profileData - Updated profile data
   * @returns {Promise} Updated profile data
   */
  static async updateUserProfile(profileData) {
    try {
      const response = await AxiosInstance.put('/auth/profile-enhanced/', profileData);
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  // =====================================
  // ATHLETE PROFILE MANAGEMENT
  // =====================================

  /**
   * Get current user's athlete profile
   * @returns {Promise} Athlete profile data
   */
  static async getMyAthleteProfile() {
    try {
      const response = await AxiosInstance.get('/athlete-profile/my-profile/');
      return response.data;
    } catch (error) {
      // If no athlete profile exists (404), return null instead of throwing
      if (error.response && error.response.status === 404) {
        return null;
      }
      throw this._handleError(error);
    }
  }

  /**
   * Create athlete profile for current user
   * @param {Object} profileData - Athlete profile data
   * @param {string} profileData.first_name - First name
   * @param {string} profileData.last_name - Last name
   * @param {string} profileData.date_of_birth - Date of birth
   * @param {string} profileData.address - Address (optional)
   * @param {string} profileData.mobile_number - Mobile number (optional)
   * @param {number} profileData.club - Club ID (optional)
   * @param {number} profileData.city - City ID (optional)
   * @param {string} profileData.previous_experience - Previous experience (optional)
   * @param {string} profileData.emergency_contact_name - Emergency contact name (optional)
   * @param {string} profileData.emergency_contact_phone - Emergency contact phone (optional)
   * @param {File} profileData.profile_image - Profile image file (optional)
   * @param {File} profileData.medical_certificate - Medical certificate file (optional)
   * @returns {Promise} Created athlete profile data
   */
  static async createAthleteProfile(profileData) {
    try {
      const formData = new FormData();
      Object.keys(profileData).forEach(key => {
        const value = profileData[key];
        // Only append non-null, non-undefined, non-empty values
        // For files, check if it's actually a File object
        if (value !== null && value !== undefined && value !== '') {
          if (key === 'profile_image' || key === 'medical_certificate') {
            // Only append files if they are actual File objects
            if (value instanceof File) {
              formData.append(key, value);
            }
          } else {
            formData.append(key, value);
          }
        }
      });

      const response = await AxiosInstance.post('/athlete-profile/my-profile/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Update athlete profile for current user
   * @param {Object} profileData - Updated athlete profile data
   * @returns {Promise} Updated athlete profile data
   */
  static async updateAthleteProfile(profileData) {
    try {
      const formData = new FormData();
      Object.keys(profileData).forEach(key => {
        if (profileData[key] !== null && profileData[key] !== undefined && profileData[key] !== '') {
          formData.append(key, profileData[key]);
        }
      });

      const response = await AxiosInstance.put('/athlete-profile/my-profile/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Get all athlete profiles (admin only)
   * @returns {Promise} List of athlete profiles
   */
  static async getAllAthleteProfiles() {
    try {
      const response = await AxiosInstance.get('/athlete-profile/');
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Get activity log for an athlete profile
   * @param {number} profileId - Athlete profile ID
   * @returns {Promise} Activity log data
   */
  static async getProfileActivityLog(profileId) {
    try {
      const response = await AxiosInstance.get(`/athlete-profile/${profileId}/activity_log/`);
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  // =====================================
  // ADMIN APPROVAL ACTIONS
  // =====================================

  /**
   * Get pending athlete profiles for admin approval
   * @returns {Promise} Pending profiles data with count
   */
  static async getPendingApprovals() {
    try {
      const response = await AxiosInstance.get('/admin/pending-approvals/');
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Process athlete profile application (admin only)
   * @param {number} profileId - Athlete profile ID
   * @param {string} action - Action to take ('approve', 'reject', 'request_revision')
   * @param {string} notes - Admin notes (required for reject/request_revision)
   * @returns {Promise} Action result
   */
  static async processProfileApplication(profileId, action, notes = '') {
    try {
      const response = await AxiosInstance.post(`/athlete-profile/${profileId}/process_application/`, {
        action,
        notes
      });
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Approve athlete profile (admin only)
   * @param {number} profileId - Athlete profile ID
   * @returns {Promise} Approval result
   */
  static async approveProfile(profileId) {
    try {
      const response = await AxiosInstance.post(`/athlete-profile/${profileId}/approve/`);
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  // =====================================
  // SUPPORTER-ATHLETE RELATIONSHIPS
  // =====================================

  /**
   * Get supporter's athlete relationships
   * @returns {Promise} List of athlete relationships
   */
  static async getSupporterAthleteRelations() {
    try {
      const response = await AxiosInstance.get('/supporter-athlete-relation/');
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Create supporter-athlete relationship
   * @param {Object} relationData - Relationship data
   * @param {number} relationData.athlete - Athlete ID
   * @param {string} relationData.relationship - Relationship type ('parent', 'guardian', 'coach', 'other')
   * @param {boolean} relationData.can_edit - Can edit athlete profile
   * @param {boolean} relationData.can_register_competitions - Can register for competitions
   * @returns {Promise} Created relationship data
   */
  static async createSupporterAthleteRelation(relationData) {
    try {
      const response = await AxiosInstance.post('/supporter-athlete-relation/', relationData);
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Update supporter-athlete relationship
   * @param {number} relationId - Relationship ID
   * @param {Object} relationData - Updated relationship data
   * @returns {Promise} Updated relationship data
   */
  static async updateSupporterAthleteRelation(relationId, relationData) {
    try {
      const response = await AxiosInstance.put(`/supporter-athlete-relation/${relationId}/`, relationData);
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Delete supporter-athlete relationship
   * @param {number} relationId - Relationship ID
   * @returns {Promise} Deletion result
   */
  static async deleteSupporterAthleteRelation(relationId) {
    try {
      const response = await AxiosInstance.delete(`/supporter-athlete-relation/${relationId}/`);
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  // =====================================
  // REFERENCE DATA
  // =====================================

  /**
   * Get all clubs
   * @returns {Promise} List of clubs
   */
  static async getClubs() {
    try {
      const response = await AxiosInstance.get('/club/');
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Get all cities
   * @returns {Promise} List of cities
   */
  static async getCities() {
    try {
      const response = await AxiosInstance.get('/city/');
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Get all approved athletes (for supporter linking)
   * @returns {Promise} List of approved athletes
   */
  static async getApprovedAthletes() {
    try {
      const response = await AxiosInstance.get('/athlete/');
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  // =====================================
  // UTILITY METHODS
  // =====================================

  /**
   * Handle API errors consistently
   * @param {Object} error - Axios error object
   * @returns {Object} Formatted error object
   */
  static _handleError(error) {
    if (error.response) {
      // Server responded with error status
      return {
        status: error.response.status,
        message: error.response.data?.message || error.response.data?.error || 'An error occurred',
        errors: error.response.data?.errors || error.response.data,
        data: error.response.data
      };
    } else if (error.request) {
      // Request made but no response
      return {
        status: 0,
        message: 'Network error - please check your connection',
        errors: null,
        data: null
      };
    } else {
      // Something else happened
      return {
        status: 0,
        message: error.message || 'An unexpected error occurred',
        errors: null,
        data: null
      };
    }
  }

  /**
   * Format form data for multipart requests
   * @param {Object} data - Data to format
   * @returns {FormData} Formatted form data
   */
  static formatFormData(data) {
    const formData = new FormData();
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined && data[key] !== '') {
        formData.append(key, data[key]);
      }
    });
    return formData;
  }
}

export default AthleteWorkflowAPI;