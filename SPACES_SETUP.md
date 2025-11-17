# DigitalOcean Spaces Setup for Media Files

## Why Spaces?

DigitalOcean App Platform uses ephemeral containers - files uploaded to the filesystem are lost on every redeploy. Spaces provides persistent S3-compatible object storage for media files.

## Setup Steps

### 1. Create a Space

1. Go to https://cloud.digitalocean.com/spaces
2. Click **Create a Space**
3. Choose a datacenter region (e.g., `nyc3`, `sfo3`, `ams3`)
4. Name your Space (e.g., `vovinam-media`)
5. Choose **Public** access (for images to be publicly accessible)
6. Click **Create a Space**

### 2. Create API Keys

1. Go to **API** → **Spaces Keys** (or https://cloud.digitalocean.com/account/api/spaces)
2. Click **Generate New Key**
3. Name it: `vovinam-admin-media`
4. Copy both:
   - **Access Key**
   - **Secret Key**
   (You won't be able to see the secret again!)

### 3. Configure App Environment Variables

1. Go to your App in DigitalOcean Console
2. Click **Settings** → **App-Level Environment Variables**
3. Add these variables:

```
USE_SPACES=True
SPACES_ACCESS_KEY_ID=<your-access-key>
SPACES_SECRET_ACCESS_KEY=<your-secret-key>
SPACES_BUCKET_NAME=vovinam-media
SPACES_ENDPOINT_URL=https://nyc3.digitaloceanspaces.com
SPACES_REGION=nyc3
```

**Important:** Replace region `nyc3` with your chosen region if different.

4. Click **Save**
5. The app will automatically redeploy

### 4. Enable CORS on Space (Optional)

If frontend makes direct requests to Spaces:

1. Go to your Space → **Settings** → **CORS Configurations**
2. Add configuration:
   - **Origin**: `*` (or your specific domain)
   - **Allowed Methods**: GET, PUT, POST
   - **Allowed Headers**: `*`

## Verification

After deployment:
1. Upload a grade image in Django admin
2. Check the Space in DigitalOcean - you should see files under `media/grades/`
3. Images should appear in admin preview and frontend

## Cost

- First 250GB storage: **Free**
- Additional storage: **$0.02/GB/month**
- Outbound transfer: First 1TB free, then $0.01/GB

For a small app, this is essentially **free**.

## Rollback

To disable Spaces and use local storage:
1. Set `USE_SPACES=False` in environment variables
2. Note: Existing media files will only be in Spaces, not local filesystem
