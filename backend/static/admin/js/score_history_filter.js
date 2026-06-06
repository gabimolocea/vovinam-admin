// Dynamic referee filtering based on selected athlete_score category
(function($) {
    'use strict';
    
    $(document).ready(function() {
        var $athleteScore = $('#id_athlete_score');
        var $referee = $('#id_referee');
        var $refereeContainer = $('.field-referee');
        
        if ($athleteScore.length && $referee.length) {
            var originalRefereeHTML = $referee.parent().html();
            
            function updateRefereeOptions(referees) {
                if (referees.length === 0) {
                    return;
                }
                
                // Clear current options
                $referee.empty();
                $referee.append('<option value="">---------</option>');
                
                // Add filtered referees
                referees.forEach(function(ref) {
                    var optionText = ref.position + ': ' + ref.name;
                    $referee.append(
                        $('<option></option>')
                            .attr('value', ref.id)
                            .text(optionText)
                    );
                });
                
                // Update help text
                var helpText = 'Showing only referees assigned to this category';
                var $helpElement = $refereeContainer.find('.help');
                if ($helpElement.length) {
                    $helpElement.text(helpText);
                } else {
                    $referee.after('<div class="help">' + helpText + '</div>');
                }
            }
            
            function updateRefereeFilter() {
                var athleteScoreId = $athleteScore.val();
                
                if (!athleteScoreId) {
                    return;
                }
                
                // Fetch category referee assignments via API
                $.ajax({
                    url: '/api/category-athlete-score/' + athleteScoreId + '/referees/',
                    type: 'GET',
                    dataType: 'json',
                    success: function(data) {
                        if (data.referees && data.referees.length > 0) {
                            updateRefereeOptions(data.referees);
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Error fetching referees:', error);
                    }
                });
            }
            
            // Listen for athlete_score changes (autocomplete widget)
            $athleteScore.on('change', updateRefereeFilter);
            
            // For autocomplete widget, also listen for selection
            $(document).on('autocompleteselect', function(e, ui) {
                if (e.target.id === 'id_athlete_score') {
                    setTimeout(updateRefereeFilter, 100);
                }
            });
            
            // Initial update if athlete_score is pre-selected
            if ($athleteScore.val()) {
                updateRefereeFilter();
            }
        }
    });
})(django.jQuery);
