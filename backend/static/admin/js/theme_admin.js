// Simple Frontend Theme Admin JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Only run on theme admin pages
    if (!window.location.pathname.includes('/frontendtheme/')) {
        return;
    }

    // Add color input enhancements
    const colorFields = [
        'primary_color', 'primary_light', 'primary_dark', 'secondary_color',
        'background_default', 'background_paper', 'text_primary', 'text_secondary',
        'table_row_hover'
    ];

    colorFields.forEach(function(fieldName) {
        const field = document.getElementById('id_' + fieldName);
        if (field) {
            // Add color picker functionality
            field.setAttribute('type', 'color');
        }
    });

    // Add number input enhancements
    const numberFields = [
        'font_size_base', 'font_weight_normal', 'font_weight_medium', 'font_weight_bold',
        'border_radius', 'spacing_unit', 'button_border_radius', 'card_elevation'
    ];

    numberFields.forEach(function(fieldName) {
        const field = document.getElementById('id_' + fieldName);
        if (field) {
            field.setAttribute('type', 'number');
        }
    });

    // JSON validation for custom_tokens
    const customTokensField = document.getElementById('id_custom_tokens');
    if (customTokensField) {
        customTokensField.addEventListener('blur', function() {
            try {
                if (this.value.trim()) {
                    JSON.parse(this.value);
                }
                this.setCustomValidity('');
            } catch (e) {
                this.setCustomValidity('Invalid JSON format');
            }
        });
    }
    
    // Add helpful tooltips
    const tooltips = {
        'id_primary_color': 'Main brand color used for buttons, links, and accents',
        'id_primary_light': 'Lighter variant used for hover states',
        'id_primary_dark': 'Darker variant used for active states',
        'id_secondary_color': 'Secondary accent color for highlights',
        'id_background_default': 'Default page background color',
        'id_background_paper': 'Card and surface background color',
        'id_text_primary': 'Primary text color',
        'id_text_secondary': 'Secondary text color for less important content'
    };

    Object.keys(tooltips).forEach(function(fieldId) {
        const field = document.getElementById(fieldId);
        if (field) {
            field.setAttribute('title', tooltips[fieldId]);
        }
    });
});

// Auto-generate light/dark variants
function generateColorVariants(baseColor) {
    // Simple color manipulation - you might want to use a more sophisticated library
    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Generate lighter variant
    const lighter = {
        r: Math.min(255, Math.floor(r + (255 - r) * 0.3)),
        g: Math.min(255, Math.floor(g + (255 - g) * 0.3)),
        b: Math.min(255, Math.floor(b + (255 - b) * 0.3))
    };
    
    // Generate darker variant
    const darker = {
        r: Math.floor(r * 0.7),
        g: Math.floor(g * 0.7),
        b: Math.floor(b * 0.7)
    };
    
    return {
        light: '#' + [lighter.r, lighter.g, lighter.b].map(x => x.toString(16).padStart(2, '0')).join(''),
        dark: '#' + [darker.r, darker.g, darker.b].map(x => x.toString(16).padStart(2, '0')).join('')
    };
}