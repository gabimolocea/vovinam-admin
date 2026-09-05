from django.contrib import admin, messages
from django.contrib.admin.models import LogEntry
from django.contrib.admin.widgets import RelatedFieldWidgetWrapper
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from django.forms import ModelForm
from django.core.exceptions import ValidationError
from django import forms
from django.urls import path, reverse
from django.shortcuts import render
from django.http import JsonResponse, HttpResponseRedirect
from reversion.admin import VersionAdmin
from dal import autocomplete, forward
from ..bracket_visualization import bracket_visualization_readonly_field, BracketStats
from django.db import models, connection
from django.db.models import Count, Case, When, IntegerField, Func
from django.db.models.functions import Lower
import json
import urllib.parse
from django.utils.safestring import mark_safe
from django.template.response import TemplateResponse
from ..models import (
    City,
    Club,
    Athlete,
    SupporterAthleteRelation,
    TrainingSeminarParticipation,
    Grade,
    GradeHistory,
    Title,
    FederationRole,
    Category,
    SoloCategory,
    TeamCategory,
    FightCategory,
    FightAthleteWeight,
    Team,
    CategoryTeam,
    CategoryAthlete,
    Match,
    MatchEvent,
    MatchRefereeScore,
    RefereeScore,
    RefereePointEvent,
    CategoryAthleteScore,
    CategoryRefereeScore,
    CategoryRefereeAssignment,
    MatchRefereeAssignment,
    CategoryTeamScore,
    TeamMember,
    Group,
    MatchVideoRecording,
    AthletePerformanceVideo,
    TeamPerformanceVideo,
    CompetitionField,
    CategoryFieldAssignment,
    MatchFieldAssignment,
    MatchRound,
    CompetitionReferee,
    DisplayMonitorSession,
    Visa,
    Event,
    EventParticipation,
    UserProxy,
)


admin.site.enable_nav_sidebar = True



from ._common import (
    CentralPenaltyForm,
    LiveCentralPenaltyEventInline,
    LiveMatchRefereeScoreInline,
    MatchFieldAssignmentInline,
    MatchRefereeAssignmentInline,
    MatchVideoRecordingInline,
)

@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ('get_id_display', 'name_with_corners', 'match_type', 'get_winner', 'category_link', 'field')
    search_fields = ('name', 'red_corner__first_name', 'red_corner__last_name', 'blue_corner__first_name', 'blue_corner__last_name', 'category__name', 'category__event__title')
    list_filter = ('match_type', 'category__event')
    competition_field = 'category'  # Will be filled from category's event

    # Use a custom change form template so we can add a quick 'Add central penalty' button
    change_form_template = 'admin/api/match/change_form.html'

    fieldsets = (
        ('DETALII MECI', {
            # Central referee is selected in the Central Penalties inline below
            # Winner is read-only and computed from referee scores/penalties
            'fields': ('category', 'match_type', 'status', 'red_corner', 'blue_corner', 'winner_display'),
            'description': 'Identifică meciul după ID. Câștigătorul este calculat automat din scorurile arbitrilor și penalizări.'
        } ),
        ('DATE LIVE (MODELE NOI DE SCORARE)', {
            'fields': ('frontend_referee_scores_panel', 'frontend_central_penalties_panel'),
            'description': 'Vizualizare doar-citire a datelor scrise de frontend-ul live/fullscreen. Nu depinde de rândurile legacy sincronizate.',
        }),
    )

    autocomplete_fields = ['red_corner', 'blue_corner']  # Winner is computed and read-only

    readonly_fields = ('winner_display', 'frontend_referee_scores_panel', 'frontend_central_penalties_panel')

    def get_queryset(self, request):
        """Select related rows used by list_display to avoid a query per row on the changelist."""
        qs = super().get_queryset(request)
        return qs.select_related('red_corner', 'blue_corner', 'category__event', 'field')

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'field':
            qs = CompetitionField.objects.filter(field_number__in=[1, 2, 3])
            try:
                category_id = request.GET.get('category')
                if not category_id:
                    match_id = request.resolver_match.kwargs.get('object_id') if request.resolver_match else None
                    if match_id:
                        match = Match.objects.filter(pk=match_id).select_related('category__event').first()
                        if match and match.category_id:
                            category_id = match.category_id
                if category_id:
                    category = Category.objects.filter(pk=category_id).select_related('event').first()
                    if category and category.event_id:
                        qs = qs.filter(event_id=category.event_id)
            except Exception:
                pass
            kwargs['queryset'] = qs
            formfield = super().formfield_for_foreignkey(db_field, request, **kwargs)
            formfield.label_from_instance = lambda obj: f"Field {obj.field_number}"
            return formfield
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
    
    def get_changeform_initial_data(self, request):
        """Pre-fill category from current competition if available"""
        initial = super().get_changeform_initial_data(request) or {}
        current_comp_id = request.session.get('current_competition_id')
        
        if current_comp_id and 'category' not in initial:
            try:
                from ..models import Category
                # Get first category from this competition
                category = Category.objects.filter(event_id=current_comp_id).first()
                if category:
                    initial['category'] = category
            except Exception:
                pass
        
        return initial

    def get_form(self, request, obj=None, **kwargs):
        form_class = super().get_form(request, obj, **kwargs)
        if 'status' in form_class.base_fields:
            form_class.base_fields['status'].label = 'Status logic meci'
            form_class.base_fields['status'].help_text = (
                'Controlează starea internă a meciului (scheduled / active / completed). '
                'Frontend-ul de meci ține cont și de statusul din programarea terenului.'
            )

        if obj and obj.field_id:
            try:
                assignment = MatchFieldAssignment.objects.filter(match=obj).first()
                if not assignment:
                    MatchFieldAssignment.objects.create(match=obj, field_id=obj.field_id)
                elif not assignment.field_id:
                    assignment.field_id = obj.field_id
                    assignment.save(update_fields=['field'])
            except Exception:
                pass
        return form_class

    def save_formset(self, request, form, formset, change):
        if formset.model == MatchFieldAssignment:
            instances = formset.save(commit=False)
            for inst in instances:
                inst.match = form.instance
                inst.save()
                if inst.field_id and form.instance.field_id != inst.field_id:
                    form.instance.field_id = inst.field_id
                    form.instance.save(update_fields=['field'])
            formset.save_m2m()
        elif formset.model == MatchRefereeScore:
            from ..views import _sync_match_referee_score_to_legacy

            affected_referee_ids = set()
            instances = formset.save(commit=False)
            for deleted in formset.deleted_objects:
                if deleted.referee_id:
                    affected_referee_ids.add(deleted.referee_id)
                deleted.delete()

            for inst in instances:
                inst.match = form.instance
                inst.save()
                if inst.referee_id:
                    affected_referee_ids.add(inst.referee_id)

            formset.save_m2m()

            for referee_id in affected_referee_ids:
                _sync_match_referee_score_to_legacy(form.instance.id, referee_id)
        elif formset.model == MatchEvent:
            from ..views import _delete_legacy_point_events, _legacy_metadata_matches, _sync_match_event_to_legacy

            deleted_event_ids = []
            instances = formset.save(commit=False)
            for deleted in formset.deleted_objects:
                deleted_event_ids.append(deleted.id)
                deleted.delete()

            for inst in instances:
                inst.match = form.instance
                if inst.corner == 'red':
                    inst.event_type = 'penalty_red'
                elif inst.corner == 'blue':
                    inst.event_type = 'penalty_blue'

                if not inst.created_by_id and hasattr(request.user, 'athlete'):
                    inst.created_by = request.user.athlete

                inst.save()
                _sync_match_event_to_legacy(inst)

            formset.save_m2m()

            for deleted_event_id in deleted_event_ids:
                _delete_legacy_point_events(
                    form.instance.id,
                    lambda event, deleted_id=deleted_event_id: _legacy_metadata_matches(
                        event.metadata,
                        origin='match_event_sync',
                        match_event_id=deleted_id,
                    )
                )
        elif formset.model == RefereeScore:
            # Let Django save the inline instances first, then translate any
            # per-round form fields (red_round_X / blue_round_X) into
            # RefereePointEvent rows of type 'score' so the shared aggregator
            # can compute adjusted totals consistently in save_related.
            super().save_formset(request, form, formset, change)
            self._sync_referee_score_round_events(request, form, formset)
        else:
            super().save_formset(request, form, formset, change)
    
    def get_id_display(self, obj):
        """Display match ID"""
        return obj.pk
    get_id_display.short_description = 'ID'
    get_id_display.admin_order_field = 'pk'

    def frontend_referee_scores_panel(self, obj):
        if not obj or not obj.pk:
            return 'Salvează mai întâi meciul.'

        scores = list(
            MatchRefereeScore.objects.filter(match=obj)
            .select_related('referee', 'round')
            .order_by('referee__last_name', 'referee__first_name', 'round__round_number', 'id')
        )
        if not scores:
            return mark_safe('<span style="color:#999;">Nu există încă scoruri live introduse din frontend.</span>')

        grouped = {}
        for score in scores:
            referee = score.referee
            if not referee:
                continue
            entry = grouped.setdefault(referee.id, {
                'name': f'{referee.first_name} {referee.last_name}'.strip() or f'Referee #{referee.id}',
                'rounds': {},
                'final': score if score.round_id is None else None,
            })
            if score.round_id is None:
                entry['final'] = score
            else:
                entry['rounds'][score.round.round_number] = score

        rows = []
        for entry in grouped.values():
            round_cells = []
            for round_number in (1, 2, 3):
                round_score = entry['rounds'].get(round_number)
                if round_score:
                    round_cells.append(f'<td style="padding:6px 8px; border:1px solid #ddd; text-align:center;">{round_score.red_corner_score} - {round_score.blue_corner_score}</td>')
                else:
                    round_cells.append('<td style="padding:6px 8px; border:1px solid #ddd; text-align:center; color:#999;">—</td>')

            final_score = entry['final']
            if final_score:
                winner = 'Roșu' if final_score.winner_choice == 'red' else ('Albastru' if final_score.winner_choice == 'blue' else 'Egalitate')
                final_cell = f'{final_score.red_corner_score} - {final_score.blue_corner_score}'
            else:
                winner = '—'
                final_cell = '—'

            rows.append(
                '<tr>'
                f'<td style="padding:6px 8px; border:1px solid #ddd;">{entry["name"]}</td>'
                + ''.join(round_cells)
                + f'<td style="padding:6px 8px; border:1px solid #ddd; text-align:center;">{final_cell}</td>'
                + f'<td style="padding:6px 8px; border:1px solid #ddd; text-align:center; font-weight:600;">{winner}</td>'
                + '</tr>'
            )

        html = (
            '<table style="border-collapse:collapse; min-width:760px;">'
            '<thead><tr>'
            '<th style="padding:6px 8px; border:1px solid #ddd; text-align:left;">Arbitru</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd;">R1</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd;">R2</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd;">R3</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd;">Final</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd;">Câștigător</th>'
            '</tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table>'
        )
        return mark_safe(html)
    frontend_referee_scores_panel.short_description = 'Scoruri arbitri din frontend'

    def frontend_central_penalties_panel(self, obj):
        if not obj or not obj.pk:
            return 'Salvează mai întâi meciul.'

        penalties = list(
            MatchEvent.objects.filter(match=obj, event_type__in=['penalty_red', 'penalty_blue'])
            .select_related('round', 'created_by')
            .order_by('-created_at')
        )
        if not penalties:
            return mark_safe('<span style="color:#999;">Nu există încă penalizări centrale introduse din frontend.</span>')

        rows = []
        for penalty in penalties:
            creator = '—'
            if penalty.created_by_id:
                creator = f'{penalty.created_by.first_name} {penalty.created_by.last_name}'.strip() or str(penalty.created_by_id)
            round_label = penalty.round.round_number if penalty.round_id else '—'
            side = 'Roșu' if penalty.corner == 'red' else ('Albastru' if penalty.corner == 'blue' else penalty.corner)
            rows.append(
                '<tr>'
                f'<td style="padding:6px 8px; border:1px solid #ddd;">{side}</td>'
                f'<td style="padding:6px 8px; border:1px solid #ddd; text-align:center;">{penalty.value}</td>'
                f'<td style="padding:6px 8px; border:1px solid #ddd; text-align:center;">{round_label}</td>'
                f'<td style="padding:6px 8px; border:1px solid #ddd;">{penalty.notes or "—"}</td>'
                f'<td style="padding:6px 8px; border:1px solid #ddd;">{creator}</td>'
                f'<td style="padding:6px 8px; border:1px solid #ddd; white-space:nowrap;">{timezone.localtime(penalty.created_at).strftime("%Y-%m-%d %H:%M:%S")}</td>'
                '</tr>'
            )

        html = (
            '<table style="border-collapse:collapse; min-width:760px;">'
            '<thead><tr>'
            '<th style="padding:6px 8px; border:1px solid #ddd; text-align:left;">Parte</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd;">Puncte</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd;">Rundă</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd; text-align:left;">Motiv</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd; text-align:left;">Creat de</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd; text-align:left;">Timestamp</th>'
            '</tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table>'
        )
        return mark_safe(html)
    frontend_central_penalties_panel.short_description = 'Penalizări centrale din frontend'

    # Show field assignment, referee assignment, live source-of-truth scoring, and recordings.
    # Legacy inlines remain defined in this module for backward compatibility but are not shown here.
    inlines = [
        MatchFieldAssignmentInline,
        MatchRefereeAssignmentInline,
        LiveMatchRefereeScoreInline,
        LiveCentralPenaltyEventInline,
        MatchVideoRecordingInline,
    ]

    class Media:
        js = ('/static/api/js/referee_inline_winner.js', '/static/api/js/recompute_match_results.js', '/static/api/js/category_scores.js',)
        css = {
            'all': ('/static/api/css/category_scores.css',)
        }

    def name_with_corners(self, obj):
        """
        Display the full names of the athletes with their corner in parentheses as a clickable bold link.
        """
        url = reverse('admin:api_match_change', args=(obj.pk,))
        red = obj.red_corner
        blue = obj.blue_corner
        red_name = f"{red.first_name} {red.last_name}" if red else "De stabilit"
        blue_name = f"{blue.first_name} {blue.last_name}" if blue else "De stabilit"
        match_name = f"{red_name} (Colț roșu) vs {blue_name} (Colț albastru)"
        return format_html('<a href="{}" style="font-weight: bold;">{}</a>', url, match_name)
    name_with_corners.short_description = _('Nume meci')

    def central_referee_display(self, obj):
        """
        Display the central referee in the change list.
        """
        if obj.central_referee:
            return f"{obj.central_referee.first_name} {obj.central_referee.last_name}"
        return "De stabilit"
    central_referee_display.short_description = _('Arbitru central')

    def competition(self, obj):
        """
        Display the event name associated with the match.
        """
        return obj.category.event.title if obj.category.event else "N/A"
    competition.short_description = _('Eveniment')

    def category_link(self, obj):
        """
        Display the category name as a bold clickable link.
        """
        url = reverse('admin:api_category_change', args=(obj.category.id,))
        return format_html('<a href="{}" style="font-weight: bold;">{}</a>', url, obj.category.name)
    category_link.short_description = _('Categorie')

    def get_winner(self, obj):
        """
        Display the full name of the winner in the admin interface.
        """
        try:
            # Prefer the computed winner from referee aggregates so the change-list
            # reflects the same logic as the change form.
            from api.scoring import compute_match_results
            results = compute_match_results(obj)
            mw = results.get('match_winner')
            if mw:
                return f"{mw.first_name} {mw.last_name}"
        except Exception:
            # fall back to stored winner
            pass
        return f"{obj.winner.first_name} {obj.winner.last_name}" if obj.winner else "De stabilit"
    get_winner.short_description = _('Câștigător')

    def winner_display(self, obj):
        """Computed winner display for the change form.

        Uses the shared scoring helper to determine the match winner based on
        referee scores and central penalties. Returns the athlete's full name
        or 'TBD' when no winner can be determined.
        """
        try:
            from api.scoring import compute_match_results
            results = compute_match_results(obj)
            mw = results.get('match_winner')
            if mw:
                return f"{mw.first_name} {mw.last_name}"
            return 'De stabilit'
        except Exception:
            # Fall back to stored winner if compute fails
            try:
                return f"{obj.winner.first_name} {obj.winner.last_name}" if obj.winner else 'De stabilit'
            except Exception:
                return 'De stabilit'
    winner_display.short_description = _('Câștigător')

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """
        Restrict athlete selection to those within the selected category for red_corner, blue_corner, and winner.
        """
        if db_field.name in ['red_corner', 'blue_corner']:
            if hasattr(request, 'obj') and isinstance(request.obj, Match):
                kwargs['queryset'] = request.obj.category.athletes.all()
        elif db_field.name == 'winner':
            if hasattr(request, 'obj') and isinstance(request.obj, Match):
                ids = []
                if request.obj.red_corner_id:
                    ids.append(request.obj.red_corner_id)
                if request.obj.blue_corner_id:
                    ids.append(request.obj.blue_corner_id)
                kwargs['queryset'] = Athlete.objects.filter(pk__in=ids)
        elif db_field.name == 'central_referee':
            # Prefer central referee choices from the match.referees if the match exists
            try:
                if hasattr(request, 'obj') and isinstance(request.obj, Match) and getattr(request.obj, 'pk', None):
                    kwargs['queryset'] = request.obj.referees.all()
                else:
                    kwargs['queryset'] = Athlete.objects.filter(is_referee=True)
            except Exception:
                kwargs['queryset'] = Athlete.objects.filter(is_referee=True)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                '<path:object_id>/add-central-penalty/',
                self.admin_site.admin_view(self.add_central_penalty_view),
                name='api_match_add_central_penalty',
            ),
            path(
                '<path:object_id>/force-start/',
                self.admin_site.admin_view(self.force_start_view),
                name='api_match_force_start',
            ),
            path(
                '<path:object_id>/recompute-results/',
                self.admin_site.admin_view(self.recompute_results_view),
                name='api_match_recompute_results',
            ),
        ]
        return custom_urls + urls

    def force_start_view(self, request, object_id, *args, **kwargs):
        from django.shortcuts import get_object_or_404

        if request.method != 'POST':
            messages.error(request, 'Pornirea forțată necesită o cerere POST.')
            return HttpResponseRedirect(reverse('admin:api_match_change', args=[object_id]))

        match = get_object_or_404(Match.objects.select_related('category', 'field'), pk=object_id)

        try:
            match.status = 'active'
            match.save(update_fields=['status'])

            assignment = MatchFieldAssignment.objects.filter(match=match).select_related('field').first()
            field_obj = getattr(assignment, 'field', None) or getattr(match, 'field', None)
            now = timezone.now()

            if assignment:
                assignment.status = 'in_progress'
                if not assignment.actual_start_time:
                    assignment.actual_start_time = now
                assignment.actual_end_time = None
                assignment.save(update_fields=['status', 'actual_start_time', 'actual_end_time'])
            elif field_obj:
                MatchFieldAssignment.objects.create(
                    match=match,
                    field=field_obj,
                    status='in_progress',
                    actual_start_time=now,
                    order=0,
                )

            if field_obj:
                DisplayMonitorSession.objects.update_or_create(
                    field=field_obj,
                    defaults={
                        'current_category_id': match.category_id,
                        'current_match_id': match.pk,
                        'current_athlete': None,
                        'status': 'displaying',
                    }
                )

            messages.success(request, f'Meciul #{match.pk} a fost pornit forțat din admin.')
        except Exception as exc:
            messages.error(request, f'Pornirea forțată a eșuat: {exc}')

        return HttpResponseRedirect(reverse('admin:api_match_change', args=[object_id]))

    def add_central_penalty_view(self, request, object_id, *args, **kwargs):
        """Admin view to create a central-referee penalty for the given match.

        The form pre-fills referee to the match.central_referee and requires side and points.
        """
        from django.shortcuts import get_object_or_404, redirect
        from ..models import RefereePointEvent

        match = get_object_or_404(Match, pk=object_id)
        central = getattr(match, 'central_referee', None)

        if central is None:
            # For AJAX, return JSON error; for normal requests redirect back with a message
            if request.headers.get('x-requested-with') == 'XMLHttpRequest':
                return JsonResponse({'ok': False, 'error': 'Nu este setat niciun arbitru central'}, status=400)
            messages.error(request, 'Acest meci nu are setat un arbitru central.')
            return redirect(reverse('admin:api_match_change', args=[object_id]))

        if request.method == 'POST':
            form = CentralPenaltyForm(request.POST)
            if form.is_valid():
                side = form.cleaned_data['side']
                points = form.cleaned_data['points']
                reason = form.cleaned_data.get('reason')

                # Create the penalty event attributed to the central referee
                ev = RefereePointEvent.objects.create(
                    match=match,
                    referee=central,
                    side=side,
                    points=points,
                    event_type='penalty',
                    created_by=request.user if request.user.is_authenticated else None,
                    metadata={'reason': reason} if reason else None,
                )
                # After creating the event, run a best-effort recompute (non-blocking)
                try:
                    from django.db import transaction
                    from ..models import RefereeScore

                    with transaction.atomic():
                        # Recompute totals using all events for this match
                        events_all = list(RefereePointEvent.objects.filter(match=match).order_by('timestamp'))
                        per_ref = {}
                        central_penalties = {'red': 0, 'blue': 0}
                        central_id = getattr(match, 'central_referee_id', None)
                        for e in events_all:
                            rid = e.referee_id
                            if rid not in per_ref:
                                per_ref[rid] = {'red': 0, 'blue': 0}
                            per_ref[rid][e.side] = per_ref[rid].get(e.side, 0) + (e.points or 0)
                            if central_id and e.referee_id == central_id and e.event_type == 'penalty':
                                central_penalties[e.side] = central_penalties.get(e.side, 0) + (e.points or 0)

                        referee_scores = []
                        for rid, sums in per_ref.items():
                            red = sums.get('red', 0)
                            blue = sums.get('blue', 0)
                            adj_red = red - central_penalties.get('red', 0)
                            adj_blue = blue - central_penalties.get('blue', 0)
                            if adj_red > adj_blue:
                                winner = 'red'
                            elif adj_blue > adj_red:
                                winner = 'blue'
                            else:
                                winner = None
                            rs, _ = RefereeScore.objects.update_or_create(
                                match=match,
                                referee_id=rid,
                                defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': winner}
                            )
                            referee_scores.append(rs)

                        # Match.winner is a read-only property computed from
                        # compute_match_results()/calculate_winner_simplified()
                        # using the freshly saved RefereeScore rows above; there
                        # is no setter, so no separate majority-vote calculation
                        # or persistence happens here (see mv below).
                except Exception:
                    # Best-effort: don't crash the admin UI if recompute fails
                    pass

                # Build a compact match_winner summary for AJAX responses
                mv = None
                try:
                    if match.winner:
                        mv = {'id': match.winner.pk, 'name': f"{match.winner.first_name} {match.winner.last_name}"}
                except Exception:
                    mv = None

                # If this is an AJAX request, return JSON so client-side can update in-place
                if request.headers.get('x-requested-with') == 'XMLHttpRequest':
                    return JsonResponse({'ok': True, 'id': ev.pk, 'match_winner': mv})

                messages.success(request, f'Created central penalty (id={ev.pk}) for {central}.')
                return redirect(reverse('admin:api_match_change', args=[object_id]))
        else:
            form = CentralPenaltyForm(initial={'points': 1})

        context = dict(
            self.admin_site.each_context(request),
            title='Add central referee penalty',
            match=match,
            central_referee=central,
            form=form,
            opts=self.model._meta,
        )
        return render(request, 'admin/api/match/add_central_penalty.html', context)

    def _sync_referee_score_round_events(self, request, form, formset):
        """Translate RefereeScore inline per-round fields into RefereePointEvent rows.

        Called by save_formset() after Django has already saved the RefereeScore
        inline instances. Maps per-round form fields (red_round_X / blue_round_X)
        into RefereePointEvent rows of type 'score' so the shared aggregator can
        compute adjusted totals consistently in save_related.
        """
        # If this was the RefereeScore inline, map per-round fields into score events
        from ..models import RefereePointEvent
        if formset.model == RefereeScore:
            match = getattr(form, 'instance', None)
            if not match:
                return

            try:
                from api.scoring import compute_match_results
                central_by_round = compute_match_results(match).get('central_penalties_by_round', {}) or {}
            except Exception:
                central_by_round = {}

            # Iterate through forms to read per-round inputs and persist score events
            for f in formset.forms:
                # Skip deleted forms
                try:
                    if f.cleaned_data.get('DELETE'):
                        continue
                except Exception:
                    # If cleaned_data isn't present (unlikely), skip
                    pass

                # Ensure the instance/referee exists
                inst = getattr(f, 'instance', None)
                if not inst or not getattr(inst, 'referee_id', None):
                    continue
                rid = inst.referee_id

                # For rounds 1..3, handle red and blue per-round scores
                # Use POST data as a robust source (fallback to cleaned_data) so
                # inline custom fields are persisted even if cleaned_data is
                # unexpectedly missing in some admin flows.
                for rd in (1, 2, 3):
                    round_adjustment = central_by_round.get(rd, {}) if isinstance(central_by_round, dict) else {}
                    # Red
                    field_name = f'red_round_{rd}'
                    val = None
                    try:
                        # Prefer explicit POST value using the form prefix
                        pref = getattr(f, 'prefix', None)
                        if pref:
                            raw = request.POST.get(f"{pref}-{field_name}")
                            if raw is not None and raw != '':
                                try:
                                    val = int(raw)
                                except Exception:
                                    val = raw
                        # Fallback to validated cleaned_data when available
                        if val is None and hasattr(f, 'cleaned_data'):
                            val = f.cleaned_data.get(field_name)
                    except Exception:
                        val = None
                    try:
                        existing_qs = RefereePointEvent.objects.filter(match=match, referee_id=rid, event_type='score', side='red')
                        # Try to filter by metadata.round when supported
                        try:
                            existing_qs = existing_qs.filter(metadata__round=rd)
                        except Exception:
                            # metadata lookup may not be supported; fall back to metadata__contains
                            try:
                                existing_qs = existing_qs.filter(metadata__contains={'round': rd})
                            except Exception:
                                pass
                    except Exception:
                        existing_qs = None

                    if val is None:
                        # delete any existing score events for this round
                        try:
                            if existing_qs is not None:
                                existing_qs.delete()
                        except Exception:
                            pass
                    else:
                        # replace existing events with the provided value
                        try:
                            raw_red_value = int(val) - int(round_adjustment.get('red', 0) or 0)
                            if existing_qs is not None and existing_qs.exists():
                                existing_qs.delete()
                            RefereePointEvent.objects.create(
                                match=match,
                                referee_id=rid,
                                side='red',
                                points=raw_red_value,
                                event_type='score',
                                metadata={'round': rd},
                                created_by=request.user if request.user.is_authenticated else None,
                            )
                        except Exception:
                            pass

                    # Blue
                    field_name_b = f'blue_round_{rd}'
                    valb = None
                    try:
                        if pref:
                            rawb = request.POST.get(f"{pref}-{field_name_b}")
                            if rawb is not None and rawb != '':
                                try:
                                    valb = int(rawb)
                                except Exception:
                                    valb = rawb
                        if valb is None and hasattr(f, 'cleaned_data'):
                            valb = f.cleaned_data.get(field_name_b)
                    except Exception:
                        valb = None
                    try:
                        existing_qs_b = RefereePointEvent.objects.filter(match=match, referee_id=rid, event_type='score', side='blue')
                        try:
                            existing_qs_b = existing_qs_b.filter(metadata__round=rd)
                        except Exception:
                            try:
                                existing_qs_b = existing_qs_b.filter(metadata__contains={'round': rd})
                            except Exception:
                                pass
                    except Exception:
                        existing_qs_b = None

                    if valb is None:
                        try:
                            if existing_qs_b is not None:
                                existing_qs_b.delete()
                        except Exception:
                            pass
                    else:
                        try:
                            raw_blue_value = int(valb) - int(round_adjustment.get('blue', 0) or 0)
                            if existing_qs_b is not None and existing_qs_b.exists():
                                existing_qs_b.delete()
                            RefereePointEvent.objects.create(
                                match=match,
                                referee_id=rid,
                                side='blue',
                                points=raw_blue_value,
                                event_type='score',
                                metadata={'round': rd},
                                created_by=request.user if request.user.is_authenticated else None,
                            )
                        except Exception:
                            pass

            # After creating/deleting score events for this formset, run a local
            # recompute so that the inline winner fields reflect the new values
            # immediately after saving. This mirrors the authoritative recompute
            # done in save_related but gives faster feedback in the same save
            # operation (the full recompute still runs in save_related).
            try:
                from api.scoring import compute_match_results
                results = compute_match_results(match)
                for (rid, red, blue, winner) in results.get('referee_scores_data', []):
                    try:
                        existing = RefereeScore.objects.filter(match=match, referee_id=rid).first()
                        if existing and existing.winner:
                            RefereeScore.objects.update_or_create(
                                match=match,
                                referee_id=rid,
                                defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': existing.winner}
                            )
                        else:
                            RefereeScore.objects.update_or_create(
                                match=match,
                                referee_id=rid,
                                defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': winner}
                            )
                    except Exception:
                        try:
                            RefereeScore.objects.update_or_create(
                                match=match,
                                referee_id=rid,
                                defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': winner}
                            )
                        except Exception:
                            pass
            except Exception:
                pass

    def save_related(self, request, form, formsets, change):
        """After all inlines are saved, run a single recompute to persist winners.

        This ensures that when admins save the match change form (including any
        combination of RefereeScore and RefereePointEvent inlines), the
        authoritative computation runs once using the fully persisted state,
        avoiding the need to save multiple times.
        """
        # First let Django save all related inlines as usual
        super().save_related(request, form, formsets, change)

        # Then run the shared helper and persist winners based on the saved DB state
        try:
            from ..models import RefereePointEvent, RefereeScore
            from api.scoring import compute_match_results
            match = form.instance
            events_qs = RefereePointEvent.objects.filter(match=match)
            results = compute_match_results(match, events_qs)

            # Persist per-referee winners/scores. Do not overwrite an explicit
            # referee winner that was provided via the inline form: prefer the
            # existing stored winner if present.
            for (rid, red, blue, winner) in results.get('referee_scores_data', []):
                try:
                    existing = RefereeScore.objects.filter(match=match, referee_id=rid).first()
                    if existing and existing.winner:
                        # Preserve the explicitly set winner
                        RefereeScore.objects.update_or_create(
                            match=match,
                            referee_id=rid,
                            defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': existing.winner}
                        )
                    else:
                        RefereeScore.objects.update_or_create(
                            match=match,
                            referee_id=rid,
                            defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': winner}
                        )
                except Exception:
                    # Best-effort per-row persistence
                    try:
                        RefereeScore.objects.update_or_create(
                            match=match,
                            referee_id=rid,
                            defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': winner}
                        )
                    except Exception:
                        pass

            # Match.winner is a read-only property computed from
            # compute_match_results()/calculate_winner_simplified(); it has no
            # setter and is intentionally not persisted here or anywhere else.
        except Exception:
            # Best-effort: don't block saving if recompute fails
            pass

    def recompute_results_view(self, request, object_id, *args, **kwargs):
        """Admin AJAX view to recompute match results and persist winners.

        This can be triggered from the admin UI to sync stored winners without
        requiring the admin to save inlines. Returns JSON with a brief summary.
        """
        from django.shortcuts import get_object_or_404
        from django.views.decorators.http import require_POST
        from ..models import RefereePointEvent, RefereeScore

        match = get_object_or_404(Match, pk=object_id)

        # Check permissions: only allow users who can change the match
        if not self.has_change_permission(request, match):
            return JsonResponse({'ok': False, 'error': 'Permission denied'}, status=403)

        # Only accept POST for side-effecting operation
        if request.method != 'POST':
            return JsonResponse({'ok': False, 'error': 'Invalid method'}, status=405)

        try:
            # Recompute using the shared helper and persist per-referee winners
            from api.scoring import compute_match_results
            events_qs = RefereePointEvent.objects.filter(match=match)
            results = compute_match_results(match, events_qs)

            persisted = []
            for (rid, red, blue, winner) in results.get('referee_scores_data', []):
                rs, _ = RefereeScore.objects.update_or_create(
                    match=match,
                    referee_id=rid,
                    defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': winner}
                )
                persisted.append({'referee_id': rid, 'winner': winner})

            # Match.winner is a read-only property computed from
            # compute_match_results()/calculate_winner_simplified(); it has no
            # setter, so it is never assigned here. Re-reading it below reflects
            # the just-persisted RefereeScore rows automatically.

            # Return a compact summary for the admin UI to render
            mv = None
            winner_athlete = match.winner
            if winner_athlete:
                mv = {'id': winner_athlete.pk, 'name': f"{winner_athlete.first_name} {winner_athlete.last_name}"}

            return JsonResponse({'ok': True, 'match_winner': mv, 'per_ref': persisted})
        except Exception as exc:
            return JsonResponse({'ok': False, 'error': str(exc)}, status=500)
