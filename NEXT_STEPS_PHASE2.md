# Next Steps: Building Phase 2 (Django Channels & API Endpoints)

## What Needs to Happen Next

You have the backend models and the frontend scaffolding. Now we need to connect them.

### Immediate Tasks (Next 3-4 Days)

#### 1. Django Serializers (1 day)
Create DRF serializers for all new/modified models in `/backend/api/serializers.py`:

```python
# Add these serializers:
- CompetitionFieldSerializer
- CategoryFieldAssignmentSerializer
- DisplayMonitorSessionSerializer
- MatchRoundSerializer
- QRCodeAssignmentSerializer
- Updated CategoryRefereeScorerSerializer (handle deductions)

# Update existing:
- CategoryAthleteScoreSerializer (if not already deductions-aware)
- MatchRefereeScoreSerializer
```

#### 2. Django ViewSets (1 day)
Create ViewSets in `/backend/api/views.py` to expose models via REST:

```python
# Add these ViewSets:
- CompetitionFieldViewSet
- CategoryFieldAssignmentViewSet  
- DisplayMonitorSessionViewSet
- MatchRoundViewSet
- QRCodeAssignmentViewSet
- CategoryRefereeScorerViewSet (update existing)

# Each should have:
- list() - GET /api/model/
- create() - POST /api/model/
- retrieve() - GET /api/model/{id}/
- update() - PUT /api/model/{id}/
- destroy() - DELETE /api/model/{id}/
```

#### 3. Register Routes (30 mins)
Update `/backend/api/urls.py`:

```python
router.register(r'competition-fields', CompetitionFieldViewSet, basename='field')
router.register(r'category-field-assignments', CategoryFieldAssignmentViewSet, basename='category-field')
router.register(r'display-monitor-sessions', DisplayMonitorSessionViewSet, basename='monitor-session')
router.register(r'match-rounds', MatchRoundViewSet, basename='match-round')
router.register(r'qr-code-assignments', QRCodeAssignmentViewSet, basename='qr-code')
router.register(r'category-referee-scores', CategoryRefereeScorerViewSet, basename='category-ref-score')
```

#### 4. Django Channels Setup (1-2 days)
Install and configure WebSocket support:

```bash
# Install
pip install channels channels-redis

# Update settings.py
INSTALLED_APPS = [
    'daphne',  # Must be first
    'django.contrib.contenttypes',
    # ... rest
]

ASGI_APPLICATION = 'crud.asgi.application'

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer'
        # Or use Redis for production: 'channels_redis.core.RedisChannelLayer'
    }
}
```

#### 5. WebSocket Consumer (1 day)
Create `/backend/api/consumers.py`:

```python
class ScoringConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Authenticate user
        # Join group for their field
        # Send "connected" message
        pass
    
    async def score_submitted(self, event):
        # Broadcast score update to all monitors watching this category
        await self.send(json.dumps({
            'type': 'scores.updated',
            'athlete_id': event['athlete_id'],
            'scores': event['scores'],
            'revealed': event['revealed']
        }))
    
    async def category_changed(self, event):
        # Monitor: Category changed on this field
        await self.send(json.dumps({
            'type': 'category.changed',
            'category_id': event['category_id']
        }))
```

#### 6. Update ViewSet Logic (1 day)
When referees submit scores, broadcast to WebSocket:

```python
class CategoryRefereeScorerViewSet(viewsets.ViewSet):
    def create(self, request):
        # Save score
        serializer.save()
        
        # Broadcast to monitors
        async_to_sync(channel_layer.group_send)(
            f"category_{category_id}",
            {
                'type': 'score_submitted',
                'scores': [...],
                'revealed': check_if_all_5_submitted()
            }
        )
        
        return Response(serializer.data, status=201)
```

---

## Testing Plan

### Test 1: API Endpoints Work
```bash
# Login
curl -X POST http://127.0.0.1:8000/api/auth/login/ \
  -d '{"email":"ref1@test.com","password":"pass"}'

# Get assigned categories
curl -H "Authorization: Bearer TOKEN" \
  http://127.0.0.1:8000/api/referees/me/assigned-categories/

# Submit score
curl -X POST http://127.0.0.1:8000/api/category-referee-scores/ \
  -H "Authorization: Bearer TOKEN" \
  -d '{"athlete_score_id":1,"deductions":{"technique":10}}'
```

### Test 2: WebSocket Connection
```javascript
// From browser console
ws = new WebSocket('ws://127.0.0.1:8000/ws/?token=YOUR_TOKEN')
ws.onmessage = (e) => console.log(JSON.parse(e.data))
```

### Test 3: Frontend Login
```bash
cd frontend
npm run dev
# Visit http://localhost:5173
# Try login (should see API call in Network tab)
```

---

## File Checklist for Phase 2

- [ ] `/backend/api/serializers.py` - Add new serializers
- [ ] `/backend/api/views.py` - Add new ViewSets
- [ ] `/backend/api/consumers.py` - Create WebSocket consumer
- [ ] `/backend/api/urls.py` - Register routes
- [ ] `/backend/crud/settings.py` - Add Channels config
- [ ] `/backend/crud/asgi.py` - Create/update ASGI app
- [ ] `/backend/api/signals.py` - Update to broadcast WebSocket events
- [ ] `/requirements.txt` - Add channels, channels-redis

---

## Architecture Validation

After Phase 2, your system will look like:

```
Frontend (Browser)
  ├── Referee Login Form
  │   └── POST /api/auth/login/ ✅
  │
  ├── Referee Scoring Form
  │   ├── GET /api/referees/me/assigned-categories/ ✅
  │   ├── GET /api/categories/{id}/ ✅
  │   └── POST /api/category-referee-scores/ ✅
  │
  ├── Display Monitor
  │   ├── GET /api/competition-fields/{id}/ ✅
  │   ├── GET /api/display-monitor-sessions/field/{id}/ ✅
  │   ├── WS /ws/ - subscribe to category updates ✅
  │   └── Broadcast: scores.updated, reveal, etc. ✅
  │
  └── Admin Dashboard
      ├── POST /api/competition-fields/ ✅
      ├── PUT /api/category-field-assignments/{id}/ ✅
      ├── POST /api/qr-code-assignments/ ✅
      └── GET /api/events/{id}/results/ ✅

All connected to: Django Backend + PostgreSQL
```

---

## Questions to Consider

1. **Redis vs In-Memory Channels?**
   - In-Memory works for single server (good for testing)
   - Redis needed for multiple server instances (production)

2. **JWT vs Session Auth?**
   - Frontend PWA needs JWT (already in code)
   - Sessions work too but JWT is better for SPA

3. **QR Code Format?**
   - Suggest: `/referee/score?qr=UNIQUE_CODE`
   - Code is generated by `QRCodeAssignment.code`

4. **WebSocket Groups?**
   - Per field: `field_1`, `field_2`, `field_3`
   - Per category: `category_456`
   - Both ways, different subscriptions

---

## Estimated Effort

- Serializers: 2-3 hours
- ViewSets: 3-4 hours
- Channels Setup: 2-3 hours
- WebSocket Consumer: 2-3 hours
- Integration Testing: 2-3 hours

**Total: 11-16 hours (1-2 days)**

Then move to Phase 3 (Referee UI components).

---

## Success Criteria for Phase 2

✅ All 6 API endpoints responding  
✅ WebSocket connects without errors  
✅ Score submission triggers broadcast  
✅ Monitor receives real-time updates  
✅ Admin can change category on monitor  
✅ Offline scores save to IndexedDB  
✅ Postman can test all endpoints  

---

Ready to build Phase 2? Let me know and I'll start with the serializers! 🚀
