# Frontend Theme Management System

This system allows you to manage frontend theme settings directly from the Django admin interface, providing real-time customization of the React application's appearance.

## Features

### 🎨 **Complete Theme Control**
- **Colors**: Primary, secondary, background, and text colors
- **Typography**: Font family, sizes, and weights  
- **Layout**: Border radius, spacing, and component styling
- **Advanced**: Custom JSON tokens for complex customizations

### 🔄 **Real-time Updates**
- Changes in Django admin are immediately available to the frontend
- No need to rebuild or restart the application
- Dynamic theme loading on application start

### 🛠 **Admin Interface Features**
- Color picker widgets for easy color selection
- Live preview of theme changes
- Theme activation system (only one active theme at a time)
- Theme duplication for easy variant creation
- Comprehensive field validation

## How to Use

### 1. Access Theme Settings
1. Go to Django Admin: `http://127.0.0.1:8000/admin/`
2. Navigate to **API** → **Frontend Themes**
3. Click on the existing theme or **Add Frontend Theme**

### 2. Configure Theme Settings

#### **Basic Settings**
- **Name**: Unique identifier for the theme
- **Is Active**: Toggle to activate this theme (only one can be active)

#### **Color Palette**
- **Primary Color**: Main brand color (`#0d47a1`)
- **Primary Light**: Lighter variant for hover states
- **Primary Dark**: Darker variant for active states
- **Secondary Color**: Accent color (`#f50057`)
- **Background Colors**: Default and paper backgrounds
- **Text Colors**: Primary and secondary text colors

#### **Typography**
- **Font Family**: Font stack for the entire application
- **Font Size Base**: Base font size in pixels
- **Font Weights**: Normal, medium, and bold weights

#### **Layout & Components**
- **Border Radius**: Corner radius for UI elements
- **Spacing Unit**: Base spacing used throughout
- **Component Settings**: Button, card, and table specific styles

#### **Advanced Settings**
- **Custom Tokens**: JSON object for complex customizations

### 3. Theme Activation
- Set **Is Active** to `True` for the theme you want to use
- Only one theme can be active at a time
- Changes take effect immediately on frontend reload

### 4. API Endpoints

#### Get Active Theme Tokens
```
GET /frontend-theme/active_tokens/
```
Returns the currently active theme's configuration.

#### Get All Themes
```
GET /frontend-theme/
```
Returns all available themes.

#### Get Specific Theme
```
GET /frontend-theme/{id}/
```
Returns a specific theme by ID.

## Theme Token Structure

The system generates a comprehensive token structure:

```json
{
  "colors": {
    "primary": "#0d47a1",
    "primaryLight": "#5e7ce2",
    "primaryDark": "#002171",
    "secondary": "#f50057",
    "neutral": {
      "100": "#f5f5f5",
      "0": "#ffffff"
    },
    "text": {
      "primary": "#212121",
      "secondary": "#757575"
    }
  },
  "typography": {
    "fontFamily": "BeVietnam, Roboto, Helvetica, Arial, sans-serif",
    "fontSize": {"base": 14},
    "fontWeight": {
      "normal": 400,
      "medium": 500,
      "bold": 700
    }
  },
  "layout": {
    "borderRadius": 8,
    "spacing": 8
  },
  "components": {
    "button": {"borderRadius": 8},
    "card": {"elevation": 2},
    "table": {"rowHover": "#f5f5f5"}
  },
  "custom": {}
}
```

## Frontend Integration

The frontend automatically:
1. Fetches theme configuration on application start
2. Applies theme to Material-UI components
3. Falls back to defaults if backend is unavailable
4. Supports hot reloading of theme changes

## Tips for Theme Creation

### 🎯 **Color Guidelines**
- Use hex colors for consistency (`#ffffff`)
- Ensure sufficient contrast for accessibility
- Test colors in both light and dark contexts

### 📝 **Typography Best Practices**
- Keep font stacks web-safe and fallback-friendly
- Use standard font weights (400, 500, 700)
- Consider readability across different screen sizes

### ⚡ **Performance Considerations**
- Theme loading adds ~200ms to initial load time
- Color changes have immediate visual impact
- Font changes may require brief reflow

### 🔧 **Advanced Customization**
Use the **Custom Tokens** field for complex styling:

```json
{
  "shadows": {
    "elevation1": "0 2px 4px rgba(0,0,0,0.1)",
    "elevation2": "0 4px 8px rgba(0,0,0,0.15)"
  },
  "transitions": {
    "default": "all 0.3s ease"
  }
}
```

## Troubleshooting

### Theme Not Loading
1. Check if backend server is running
2. Verify theme is marked as active
3. Check browser console for errors
4. Ensure CORS is properly configured

### Colors Not Applying
1. Verify hex color format (`#ffffff`)
2. Check if custom CSS is overriding theme
3. Clear browser cache and reload

### Font Issues
1. Ensure font family is web-accessible
2. Check for typos in font names
3. Verify fallback fonts are included

## Database Model

The theme system uses the `FrontendTheme` model with these key fields:

- `name`: Theme identifier
- `is_active`: Activation flag
- `primary_color`, `secondary_color`: Main colors
- `font_family`, `font_size_base`: Typography settings
- `border_radius`, `spacing_unit`: Layout settings
- `custom_tokens`: JSON field for advanced customization

## Security Notes

- Theme endpoints are publicly accessible (no authentication required)
- Only admin users can modify themes through Django admin
- Custom tokens should be validated JSON to prevent issues
- Color inputs are validated for proper hex format

---

**Need Help?** Check the Django admin interface for field-specific tooltips and validation messages.