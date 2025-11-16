# DigitalOcean App Platform Configuration
# This file is used when deploying via App Platform GUI

spec:
  name: frvv-admin-backend
  region: fra
  
  services:
  - name: web
    github:
      repo: gabimolocea/frvv-admin
      branch: main
      deploy_on_push: true
    source_dir: /backend
    dockerfile_path: backend/Dockerfile
    
    http_port: 8000
    
    instance_count: 1
    instance_size_slug: basic-xxs
    
    envs:
    - key: DEBUG
      value: "False"
    - key: ALLOWED_HOSTS
      value: ".ondigitalocean.app"
    - key: DJANGO_SECRET_KEY
      type: SECRET
      value: "generate-this-in-app-platform"
    - key: DATABASE_URL
      type: SECRET
      value: "${db.DATABASE_URL}"
    - key: CORS_ALLOWED_ORIGINS
      value: "https://your-frontend-domain.com"
    
    health_check:
      http_path: /admin/login/
      initial_delay_seconds: 60
      period_seconds: 10
      timeout_seconds: 5
      success_threshold: 1
      failure_threshold: 3
  
  databases:
  - name: db
    engine: PG
    version: "15"
    production: false
    cluster_name: frvv-admin-db
