from django.contrib import admin
from django.apps import apps

# NEWS admin is disabled - only API/Events should be shown in admin
# The news app models exist for legacy compatibility but are not registered in admin

# Avoid importing model classes directly from other apps at import time to
# prevent migration state/render issues. Look up the migration-created proxy
# model dynamically and register it using the existing NewsCommentAdmin from
# `landing.admin` so behavior is preserved.
try:
    Comment = apps.get_model('news', 'Comment')
except LookupError:
    Comment = None

try:
    Post = apps.get_model('news', 'Post')
except LookupError:
    Post = None

try:
    GalleryImage = apps.get_model('news', 'GalleryImage')
except LookupError:
    GalleryImage = None

# NEWS models are NOT registered in admin - only API/Events are visible
# Uncomment below to re-enable NEWS in admin:

# try:
#     from landing.admin import NewsCommentAdmin as LandingNewsCommentAdmin
# except Exception:
#     LandingNewsCommentAdmin = None

# if Comment is not None:
#     if LandingNewsCommentAdmin:
#         admin.site.register(Comment, LandingNewsCommentAdmin)
#     else:
#         admin.site.register(Comment)

# try:
#     from landing.admin import NewsPostAdmin as LandingNewsPostAdmin
# except Exception:
#     LandingNewsPostAdmin = None

# if Post is not None:
#     if LandingNewsPostAdmin:
#         admin.site.register(Post, LandingNewsPostAdmin)
#     else:
#         admin.site.register(Post)

# try:
#     from landing.admin import NewsPostGalleryAdmin as LandingNewsPostGalleryAdmin
# except Exception:
#     LandingNewsPostGalleryAdmin = None

# if GalleryImage is not None:
#     if LandingNewsPostGalleryAdmin:
#         admin.site.register(GalleryImage, LandingNewsPostGalleryAdmin)
#     else:
#         admin.site.register(GalleryImage)
