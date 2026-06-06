(function($) {
    'use strict';

    // Auto-calculate place based on total scores
    function autoCalculatePlaces(tableSelector, totalFieldPrefix, placeFieldPrefix, disqualifiedPrefix) {
        const rows = [];
        
        // Collect all rows with their total scores
        $(tableSelector).each(function(index) {
            const row = $(this);
            const totalText = row.find('[name$="' + totalFieldPrefix + '"]').text().trim();
            const disqualified = row.find('[name$="' + disqualifiedPrefix + '"]').is(':checked');
            const placeSelect = row.find('[name$="' + placeFieldPrefix + '"]');
            
            if (totalText && totalText !== '-' && !disqualified) {
                const total = parseFloat(totalText);
                if (!isNaN(total)) {
                    rows.push({
                        index: index,
                        total: total,
                        placeSelect: placeSelect
                    });
                }
            }
        });
        
        // Sort by total score (highest first)
        rows.sort((a, b) => b.total - a.total);
        
        // Assign places
        rows.forEach((row, idx) => {
            if (idx === 0) {
                row.placeSelect.val('1');
            } else if (idx === 1) {
                row.placeSelect.val('2');
            } else if (idx === 2) {
                row.placeSelect.val('3');
            } else {
                row.placeSelect.val('');
            }
        });
    }

    // Mark highest and lowest scores with strikethrough
    function markScores(rowSelector) {
        $(rowSelector).each(function() {
            const row = $(this);
            const scores = [];
            
            // Collect all 5 referee scores
            ['ref1_score', 'ref2_score', 'ref3_score', 'ref4_score', 'ref5_score'].forEach(function(field) {
                const input = row.find('[name$="' + field + '"]');
                const value = parseFloat(input.val());
                if (!isNaN(value) && value > 0) {
                    scores.push({
                        input: input,
                        value: value
                    });
                }
            });
            
            if (scores.length >= 3) {
                // Sort to find highest and lowest
                const sorted = scores.slice().sort((a, b) => a.value - b.value);
                const lowest = sorted[0].value;
                const highest = sorted[sorted.length - 1].value;
                
                // Apply strikethrough class
                scores.forEach(function(score) {
                    if (score.value === lowest || score.value === highest) {
                        score.input.addClass('score-strikethrough');
                    } else {
                        score.input.removeClass('score-strikethrough');
                    }
                });
            }
        });
    }

    // Calculate total score (excluding highest and lowest)
    function calculateTotal(rowSelector, totalFieldName) {
        $(rowSelector).each(function() {
            const row = $(this);
            const scores = [];
            
            // Collect all 5 referee scores
            ['ref1_score', 'ref2_score', 'ref3_score', 'ref4_score', 'ref5_score'].forEach(function(field) {
                const input = row.find('[name$="' + field + '"]');
                const value = parseFloat(input.val());
                if (!isNaN(value) && value > 0) {
                    scores.push(value);
                }
            });
            
            let total = '-';
            if (scores.length >= 3) {
                scores.sort((a, b) => a - b);
                // Remove highest and lowest, sum the rest
                const middleScores = scores.slice(1, -1);
                const sum = middleScores.reduce((a, b) => a + b, 0);
                total = sum.toFixed(2);
            }
            
            // Update total display (readonly field)
            const totalCell = row.find('.field-' + totalFieldName);
            totalCell.text(total);
            totalCell.addClass('total-score');
        });
    }

    $(document).ready(function() {
        // For CategoryAthlete (Solo categories)
        const athleteRows = '.inline-group#categoryathlete_set-group .form-row:not(.empty-form)';
        
        // For CategoryTeam (Team categories)
        const teamRows = '.inline-group#categoryteam_set-group .form-row:not(.empty-form)';
        
        function updateScores() {
            // Update both athlete and team inlines
            if ($(athleteRows).length > 0) {
                markScores(athleteRows);
                calculateTotal(athleteRows, 'total_display');
                setTimeout(() => {
                    autoCalculatePlaces(athleteRows, 'total_display', 'place', 'disqualified');
                }, 100);
            }
            
            if ($(teamRows).length > 0) {
                markScores(teamRows);
                calculateTotal(teamRows, 'total_display');
                setTimeout(() => {
                    autoCalculatePlaces(teamRows, 'total_display', 'place', 'disqualified');
                }, 100);
            }
        }
        
        // Run on page load
        updateScores();
        
        // Run on any score input change
        $(document).on('change input', 'input[name*="ref1_score"], input[name*="ref2_score"], input[name*="ref3_score"], input[name*="ref4_score"], input[name*="ref5_score"], input[name*="disqualified"]', function() {
            updateScores();
        });
        
        // Run when new inline forms are added
        $(document).on('formset:added', function() {
            setTimeout(updateScores, 100);
        });
    });
})(django.jQuery);
