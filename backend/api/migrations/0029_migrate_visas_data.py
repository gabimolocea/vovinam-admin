from django.db import migrations


def copy_visas(apps, schema_editor):
    # Get historical models
    Visa = apps.get_model('api', 'Visa')
    try:
        MedicalVisa = apps.get_model('api', 'MedicalVisa')
    except LookupError:
        MedicalVisa = None
    try:
        AnnualVisa = apps.get_model('api', 'AnnualVisa')
    except LookupError:
        AnnualVisa = None

    # Copy medical visas
    if MedicalVisa is not None:
        for mv in MedicalVisa.objects.all():
            # Map fields
            Visa.objects.create(
                athlete_id=mv.athlete_id,
                visa_type='medical',
                issued_date=mv.issued_date,
                document=getattr(mv, 'medical_document', None) or None,
                image=getattr(mv, 'medical_image', None) or None,
                notes=mv.notes,
                health_status=mv.health_status,
                status=mv.status,
                submitted_date=mv.submitted_date,
                reviewed_date=mv.reviewed_date,
                reviewed_by_id=mv.reviewed_by_id,
                admin_notes=mv.admin_notes,
            )

    # Copy annual visas
    if AnnualVisa is not None:
        for av in AnnualVisa.objects.all():
            Visa.objects.create(
                athlete_id=av.athlete_id,
                visa_type='annual',
                issued_date=av.issued_date,
                document=getattr(av, 'visa_document', None) or None,
                image=getattr(av, 'visa_image', None) or None,
                notes=av.notes,
                visa_status=av.visa_status,
                status=av.status,
                submitted_date=av.submitted_date,
                reviewed_date=av.reviewed_date,
                reviewed_by_id=av.reviewed_by_id,
                admin_notes=av.admin_notes,
            )


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0028_create_visa'),
    ]

    operations = [
        migrations.RunPython(copy_visas, reverse_code=migrations.RunPython.noop),
    ]
