// Add autocomplete datalist for team names in Category admin
(function($) {
    'use strict';
    
    $(document).ready(function() {
        // Get the category ID from the URL
        var pathParts = window.location.pathname.split('/');
        var categoryId = null;
        
        // Extract category ID from URL like /admin/api/category/26/change/
        var categoryIndex = pathParts.indexOf('category');
        if (categoryIndex !== -1 && pathParts[categoryIndex + 1]) {
            categoryId = pathParts[categoryIndex + 1];
        }
        
        if (!categoryId || categoryId === 'add') {
            console.log('No category ID found - skipping team autocomplete');
            return;
        }
        
        // Fetch enrolled teams for this category
        $.ajax({
            url: '/api/categories/' + categoryId + '/',
            type: 'GET',
            dataType: 'json',
            success: function(categoryData) {
                // Create datalist element if it doesn't exist
                var datalist = $('#team-names-list');
                if (datalist.length === 0) {
                    datalist = $('<datalist id="team-names-list"></datalist>');
                    $('body').append(datalist);
                }
                
                // Clear existing options
                datalist.empty();
                
                // Add enrolled team names to datalist
                if (categoryData.enrolled_teams && categoryData.enrolled_teams.length > 0) {
                    categoryData.enrolled_teams.forEach(function(enrollment) {
                        var teamName = enrollment.team_name || enrollment.team?.name;
                        if (teamName) {
                            datalist.append('<option value="' + teamName + '">');
                        }
                    });
                    console.log('Team autocomplete loaded:', datalist.children().length, 'enrolled teams');
                } else {
                    console.log('No enrolled teams found for this category');
                }
            },
            error: function(xhr, status, error) {
                console.error('Error loading enrolled teams:', error);
                console.log('Falling back to all teams...');
                
                // Fallback: load all teams if category endpoint fails
                $.ajax({
                    url: '/api/teams/',
                    type: 'GET',
                    dataType: 'json',
                    success: function(data) {
                        var datalist = $('#team-names-list');
                        if (datalist.length === 0) {
                            datalist = $('<datalist id="team-names-list"></datalist>');
                            $('body').append(datalist);
                        }
                        datalist.empty();
                        
                        var teams = data.results || data;
                        if (Array.isArray(teams)) {
                            teams.forEach(function(team) {
                                datalist.append('<option value="' + team.name + '">');
                            });
                        }
                    }
                });
            }
        });
    });
})(django.jQuery);
