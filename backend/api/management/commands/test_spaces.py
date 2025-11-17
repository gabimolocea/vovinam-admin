"""
Django management command to test DigitalOcean Spaces connection
"""
from django.core.management.base import BaseCommand
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.conf import settings


class Command(BaseCommand):
    help = 'Test DigitalOcean Spaces connection by uploading a test file'

    def handle(self, *args, **options):
        self.stdout.write('Testing Spaces connection...\n')
        
        # Check if Spaces is enabled
        if not getattr(settings, 'USE_SPACES', False):
            self.stdout.write(self.style.ERROR('USE_SPACES is not enabled'))
            return
        
        # Display current settings
        self.stdout.write(f'Storage backend: {default_storage.__class__.__name__}')
        self.stdout.write(f'Bucket: {settings.AWS_STORAGE_BUCKET_NAME}')
        self.stdout.write(f'Endpoint: {settings.AWS_S3_ENDPOINT_URL}')
        self.stdout.write(f'Region: {settings.AWS_S3_REGION_NAME}')
        self.stdout.write(f'Media URL: {settings.MEDIA_URL}\n')
        
        # Try to upload a test file
        test_content = ContentFile(b'Test file content from Django')
        test_filename = 'test/connection_test.txt'
        
        try:
            self.stdout.write('Uploading test file...')
            path = default_storage.save(test_filename, test_content)
            self.stdout.write(self.style.SUCCESS(f'✓ File uploaded successfully: {path}'))
            
            # Get the URL
            url = default_storage.url(path)
            self.stdout.write(self.style.SUCCESS(f'✓ File URL: {url}'))
            
            # Try to check if file exists
            exists = default_storage.exists(path)
            self.stdout.write(self.style.SUCCESS(f'✓ File exists check: {exists}'))
            
            # Clean up
            self.stdout.write('\nCleaning up test file...')
            default_storage.delete(path)
            self.stdout.write(self.style.SUCCESS('✓ Test file deleted'))
            
            self.stdout.write(self.style.SUCCESS('\n✓ Spaces connection test PASSED'))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\n✗ Spaces connection test FAILED'))
            self.stdout.write(self.style.ERROR(f'Error: {str(e)}'))
            import traceback
            self.stdout.write(traceback.format_exc())
