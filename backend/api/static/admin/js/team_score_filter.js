(function($) {
    'use strict';
    
    $(document).ready(function() {
        var categoryField = $('#id_category');
        var enrolledTeamField = $('#id_enrolled_team');
        
        // Get CSRF token
        function getCookie(name) {
            var cookieValue = null;
            if (document.cookie && document.cookie !== '') {
                var cookies = document.cookie.split(';');
                for (var i = 0; i < cookies.length; i++) {
                    var cookie = cookies[i].trim();
                    if (cookie.substring(0, name.length + 1) === (name + '=')) {
                        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                        break;
                    }
                }
            }
            return cookieValue;
        }
        
        if (categoryField.length && enrolledTeamField.length) {
            function filterEnrolledTeams() {
                var selectedCategoryId = categoryField.val();
                
                if (!selectedCategoryId) {
                    // No category selected, clear team dropdown
                    enrolledTeamField.empty();
                    enrolledTeamField.append('<option value="">---------</option>');
                    return;
                }
                
                var csrftoken = getCookie('csrftoken');
                
                // Fetch enrolled teams for this category
                $.ajax({
                    url: '/api/categories/' + selectedCategoryId + '/',
                    method: 'GET',
                    dataType: 'json',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRFToken': csrftoken
                    },
                    success: function(data) {
                        enrolledTeamField.empty();
                        enrolledTeamField.append('<option value="">---------</option>');
                        
                        if (data.enrolled_teams && data.enrolled_teams.length > 0) {
                            // Populate with enrolled teams
                            data.enrolled_teams.forEach(function(enrolledTeam) {
                                enrolledTeamField.append(
                                    '<option value="' + enrolledTeam.id + '">' + 
                                    enrolledTeam.team_name + 
                                    '</option>'
                                );
                            });
                        } else {
                            enrolledTeamField.append('<option value="" disabled>No enrolled teams</option>');
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Failed to fetch category enrolled teams:', status, error);
                        console.error('Response:', xhr.responseText);
                        enrolledTeamField.empty();
                        enrolledTeamField.append('<option value="" disabled>Error loading teams</option>');
                    }
                });
            }
            
            // Trigger filtering when category changes
            categoryField.on('change', filterEnrolledTeams);
            
            // Initial filter on page load if category is pre-selected
            if (categoryField.val()) {
                filterEnrolledTeams();
            }
        }
    });
})(django.jQuery);
