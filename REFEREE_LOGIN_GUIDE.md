# Referee Login Guide

**Complete step-by-step instructions for logging in as a referee**

---

## 🎯 Quick Overview

As a referee, you have a dedicated scoring interface in the Vovinam Admin system. This guide walks through:
1. ✅ Creating your referee account (if new)
2. ✅ Logging in to the system
3. ✅ Accessing your assigned categories
4. ✅ Starting the scoring interface

---

## 📋 Requirements Before Login

### Account Prerequisites
- **Username**: Assigned by your federation administrator
- **Password**: Set by your federation administrator (you can change it after login)
- **Email**: Your official email address
- **Role**: Must be set to "Referee" by an administrator

### System Requirements
- **Browser**: Chrome, Firefox, Safari, or Edge (latest version)
- **Mobile**: iOS Safari or Android Chrome
- **Internet**: Active connection (works offline after initial load)

### Permissions
- Your administrator must have assigned you to at least one category
- You must have the "Referee" role in the system

---

## 🔐 Login Steps

### Step 1: Go to the Login Page

**On Desktop:**
1. Open your browser
2. Navigate to: `http://localhost:5173` (or your server URL)
3. You should see the login page

**On Mobile:**
1. Open browser
2. Navigate to the same URL
3. Login page appears (responsive design)

### Step 2: Enter Your Credentials

On the login page, you'll see two fields:

```
┌─────────────────────────────────────────┐
│  Username:  [________________]          │
│                                          │
│  Password:  [________________]          │
│                                          │
│            [   LOGIN BUTTON   ]          │
└─────────────────────────────────────────┘
```

**Field Details:**

| Field | What to Enter | Example |
|-------|---------------|---------|
| **Username** | Your assigned username | `referee_john` |
| **Password** | Your password (case-sensitive) | ••••••••• |

**Steps:**
1. Click in the "Username" field
2. Type your username exactly as provided
3. Click in the "Password" field
4. Type your password (characters appear as dots for security)
5. Click the "LOGIN" button

### Step 3: Successful Login

After successful login, you'll see:

✅ **Confirmation:**
- System redirects you to the referee dashboard
- Page shows "Welcome, [Your Name]"
- You see your assigned categories

❌ **If Login Fails:**
- Error message appears: "Invalid credentials"
- Check that username and password are correct
- Ensure Caps Lock is NOT on
- Contact your administrator if you forgot your password

---

## 🏠 After Logging In

### Dashboard Layout

```
┌──────────────────────────────────────────┐
│  REFEREE DASHBOARD                       │
│  ✓ Admin  ✓ Dashboard  ✓ Logout          │
├──────────────────────────────────────────┤
│                                           │
│  Welcome, [Your Name]                    │
│  Role: Referee                           │
│  Status: Active ✓                        │
│                                           │
│  ┌─ YOUR ASSIGNED CATEGORIES ──────────┐ │
│  │                                       │ │
│  │ □ Category: Men's 65kg              │ │
│  │   Status: Active, 12 Athletes       │ │
│  │   [VIEW SCORES]                     │ │
│  │                                       │ │
│  │ □ Category: Women's 50kg            │ │
│  │   Status: Active, 8 Athletes        │ │
│  │   [VIEW SCORES]                     │ │
│  │                                       │ │
│  └───────────────────────────────────────┘ │
│                                             │
└─────────────────────────────────────────────┘
```

### What You Can Do

1. **View Assigned Categories** - See all categories you're assigned to
2. **View Athletes** - See all athletes in your category
3. **Score Athletes** - Enter scores for solo performances
4. **Score Matches** - Enter scores for fighting matches
5. **View History** - See your scoring history
6. **Logout** - Exit the system

---

## 📊 Accessing Your Category

### Step 1: Find Your Category

On the dashboard, look for your assigned category:

**Example:** "Men's 65kg"

### Step 2: Click [VIEW SCORES]

Click the green "VIEW SCORES" button for your category

### Step 3: See Athletes in Category

The page shows:
```
┌───────────────────────────────────────┐
│  CATEGORY: Men's 65kg                 │
│                                        │
│  [Search Athletes...       ] [Filters] │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │ # │ Name        │ Score │ Status │ │
│  ├──────────────────────────────────┤ │
│  │ 1 │ Ion Popescu │  ✎    │ Pending│ │
│  │ 2 │ Mihai Ionov │  ✓    │ Done   │ │
│  │ 3 │ Radu Dragan │  ✎    │ Pending│ │
│  └──────────────────────────────────┘ │
│                                        │
└───────────────────────────────────────┘
```

### Step 4: Score an Athlete

**For Solo Performance:**
1. Click on the athlete name or ✎ icon
2. Enter the score: `[0-10]`
3. Add any deductions if applicable
4. Click "SUBMIT SCORE"
5. Score is saved to the system

**For Fighting Match:**
1. Click on the match
2. Enter Round 1 scores: Red: `[0-10]` Blue: `[0-10]`
3. Enter Round 2 scores (if applicable)
4. Select winner if needed
5. Click "SUBMIT MATCH SCORE"

---

## 🔑 Credential Management

### If You Forgot Your Password

**Steps:**
1. On the login page, look for "Forgot Password?" link (if available)
2. OR contact your federation administrator
3. They can reset your password
4. You'll receive a temporary password via email
5. Change it after logging in:
   - Click your profile icon (top right)
   - Select "Change Password"
   - Enter old password
   - Enter new password (twice)
   - Click "SAVE"

### Changing Your Password (After Login)

**Steps:**
1. Click your name/profile icon in top right
2. Select "Settings" or "Profile"
3. Click "Change Password"
4. Enter current password
5. Enter new password
6. Confirm new password
7. Click "SAVE"

**Password Requirements:**
- Minimum 8 characters
- Mix of letters and numbers recommended
- Case-sensitive (A ≠ a)

---

## 📱 Mobile Login

### Steps (Same as Desktop)

1. Open browser on your mobile device
2. Navigate to: `http://localhost:5173` (or your server)
3. Enter username
4. Enter password
5. Tap LOGIN

### Mobile Tips

**Tips for better experience:**
- ✅ Use Chrome on Android for best performance
- ✅ Use Safari on iPhone for best performance
- ✅ Add app to home screen for easier access:
  - Chrome: Menu → "Install app"
  - Safari: Share → "Add to Home Screen"
- ✅ Works offline after first load
- ✅ Automatically syncs scores when online

### Mobile Scoring

On mobile, scoring interface is optimized:

```
┌──────────────────────────┐
│ CATEGORY: Men's 65kg     │
│                          │
│ Athlete: Ion Popescu     │
│                          │
│ Solo Score:              │
│ ┌────────────────────┐   │
│ │       [8]          │   │
│ │                    │   │
│ │ - Left - Right +   │   │
│ └────────────────────┘   │
│                          │
│ Deductions:              │
│ ┌────────────────────┐   │
│ │       [-2]         │   │
│ │ (if applicable)    │   │
│ └────────────────────┘   │
│                          │
│    [SUBMIT SCORE]        │
│                          │
└──────────────────────────┘
```

---

## ⚠️ Troubleshooting

### "Invalid credentials" Error

**Possible Causes:**
1. ❌ Wrong username
2. ❌ Wrong password
3. ❌ Caps Lock is on
4. ❌ Extra spaces in fields
5. ❌ Account not created yet

**Solutions:**
- Verify username is exactly correct (including case)
- Verify password is exactly correct
- Press Caps Lock to turn it off
- Clear extra spaces with backspace
- Contact administrator if account doesn't exist

### "Connection timeout" Error

**Possible Causes:**
1. ❌ Server is down
2. ❌ Internet connection lost
3. ❌ Firewall blocking connection
4. ❌ Wrong server URL

**Solutions:**
- Check internet connection
- Try refreshing the page (F5 or Cmd+R)
- Check with other users if server is down
- Verify the correct server URL
- Contact your IT administrator

### "Access denied" After Login

**Possible Causes:**
1. ❌ Not assigned to any category
2. ❌ Role not set to "Referee"
3. ❌ Account disabled
4. ❌ Session expired

**Solutions:**
- Contact administrator to verify your role
- Have administrator assign you to a category
- Log out and log back in
- Clear browser cache (Ctrl+Shift+Delete) and retry

### Page Won't Load on Mobile

**Possible Causes:**
1. ❌ Outdated browser
2. ❌ Cache issues
3. ❌ Mobile browser doesn't support app

**Solutions:**
- Update browser to latest version
- Clear browser cache and cookies
- Try different browser (Chrome vs Safari)
- Use "Add to Home Screen" feature for better performance

---

## 🔒 Security Tips

### Keep Your Account Safe

1. ✅ **Never share your password**
   - Only administrators should ask for password in setup
   - Never share password in emails or messages

2. ✅ **Logout when done**
   - Always click "Logout" when finished
   - Don't just close the browser

3. ✅ **Use strong passwords**
   - Mix of letters, numbers, symbols
   - Avoid personal info (birthdate, phone, etc.)
   - Avoid common words (password, 123456, etc.)

4. ✅ **Lock your device**
   - Especially on mobile devices
   - Prevents unauthorized access

5. ✅ **Use public WiFi carefully**
   - Avoid scoring on unsecured WiFi
   - Use VPN if scoring from public WiFi

---

## 📞 Getting Help

### If You Need Assistance

**Quick Issues:**
- Forgot password → Ask administrator
- Can't access category → Ask administrator  
- Technical problems → Contact IT support

**Contact Information:**
- **Administrator Email**: [admin@vovinam.ro]
- **IT Support**: [support@vovinam.ro]
- **Hotline**: +40 XXX XXXXXX

**When Contacting Support, Provide:**
- Your username
- What you're trying to do
- Error message (if any)
- Browser and device type
- What you already tried

---

## 🎓 Next Steps After Login

### Your Typical Workflow

1. **Login** (this guide)
2. **See your categories** on dashboard
3. **Click category** → VIEW SCORES
4. **Score athletes** in your category
5. **Submit scores** to system
6. **View history** of your scores
7. **Logout** when done

### Common Tasks

| Task | How to Do It |
|------|-------------|
| **View my categories** | On dashboard, scroll down |
| **Score an athlete** | Click athlete → enter score → submit |
| **Score a match** | Click match → enter round scores → submit |
| **View my history** | Click "History" tab |
| **Change password** | Profile → Settings → Change Password |
| **Logout** | Click name (top right) → Logout |

---

## ✅ Checklist: First-Time Login

Use this checklist for your first login:

- [ ] Username provided by administrator
- [ ] Password provided by administrator
- [ ] Navigate to login page
- [ ] Enter username and password
- [ ] Click LOGIN
- [ ] See dashboard with your name
- [ ] See at least one assigned category
- [ ] Click VIEW SCORES on a category
- [ ] See list of athletes
- [ ] Try entering a test score
- [ ] Score saved successfully ✓
- [ ] Click Logout
- [ ] Successfully logged out

---

## 📊 System Features Overview

### What You'll See As a Referee

| Feature | Purpose | Location |
|---------|---------|----------|
| **Dashboard** | Overview of categories | Home after login |
| **Categories** | Your assigned scoring areas | Dashboard main section |
| **Athlete List** | Athletes in your category | Click VIEW SCORES |
| **Scoring Form** | Enter solo/match scores | Click athlete/match |
| **History** | View past scores | History tab |
| **Settings** | Change password, preferences | Profile menu |
| **Logout** | Exit system securely | Profile menu |

---

## 🎯 Success Criteria

✅ **You've successfully logged in when:**

1. Page shows "Welcome, [Your Name]"
2. You can see your assigned categories
3. You can click on a category and see athletes
4. You can click on an athlete and enter a score
5. Score saves successfully to the system
6. You can view your score history
7. You can logout successfully

---

## 📖 Additional Resources

- **Full System Guide**: See `PHASE_5_TESTING_GUIDE.md`
- **Browser Compatibility**: See `PHASE_5_BROWSER_TESTING_GUIDE.md`
- **Technical Issues**: See backend logs at `/var/log/django.log`
- **Database Issues**: Contact your database administrator

---

## 🚀 You're Ready!

You now have everything you need to:
1. ✅ Log in to the Vovinam Admin system
2. ✅ Access your assigned categories
3. ✅ Score athletes and matches
4. ✅ View your scoring history
5. ✅ Manage your account safely

**Questions?** Contact your federation administrator.

**Happy scoring!** 🥋

---

**Document Version**: 1.0  
**Last Updated**: February 7, 2026  
**Status**: Complete for Phase 5 Testing
