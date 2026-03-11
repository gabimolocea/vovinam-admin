from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from api.models import (
    Athlete,
    Category,
    CategoryAthlete,
    CategoryAthleteScore,
    CategoryFieldAssignment,
    CategoryRefereeAssignment,
    CategoryRefereeScore,
    CategoryTeam,
    City,
    Club,
    CompetitionField,
    CompetitionReferee,
    DisplayMonitorSession,
    FightAthleteWeight,
    FightCategory,
    Group,
    Match,
    MatchEvent,
    MatchFieldAssignment,
    MatchRefereeAssignment,
    MatchRefereeScore,
    MatchRound,
    SoloCategory,
    Team,
    TeamCategory,
    TeamMember,
)
from api.views import (
    _advance_to_next,
    _sync_match_event_to_legacy,
    _sync_match_referee_score_to_legacy,
    advance_match_winner,
    generate_brackets,
)
from landing.models import Event

User = get_user_model()


class Command(BaseCommand):
    help = "Seed deterministic end-to-end competition data for admin/live/rankings testing."

    def add_arguments(self, parser):
        parser.add_argument("--event-id", type=int, default=9, help="Target event id. Defaults to 9.")
        parser.add_argument("--prefix", type=str, default="E2E 2026", help="Prefix used for seeded records.")

    def handle(self, *args, **options):
        event_id = options["event_id"]
        prefix = options["prefix"].strip()

        try:
            event = Event.objects.get(pk=event_id)
        except Event.DoesNotExist as exc:
            raise CommandError(f"Event {event_id} was not found.") from exc

        with transaction.atomic():
            self.stdout.write(self.style.NOTICE(f"Seeding data for event {event.id} - {event.title}"))
            self.prefix = prefix
            self.factory = APIRequestFactory()
            self.base_now = timezone.now().replace(second=0, microsecond=0)

            self.cleanup_existing_seed(event, prefix)
            city, clubs = self.ensure_supporting_entities(prefix)
            referees = self.create_referees(clubs)
            athletes = self.create_athletes(clubs)
            groups = self.create_groups(event, prefix)
            fields = self.ensure_fields(event)
            self.register_referees(event, referees)

            completed_solo = self.create_solo_category(
                event=event,
                group=groups["junior"],
                gender="male",
                name=f"{prefix} Solo Finalizat",
                athletes=athletes["solo_male"][:4],
                referees=referees,
                field=fields[0],
                order=1,
                status="completed",
            )
            in_progress_solo = self.create_solo_category(
                event=event,
                group=groups["cadet"],
                gender="female",
                name=f"{prefix} Solo În Desfășurare",
                athletes=athletes["solo_female"][:4],
                referees=referees,
                field=fields[0],
                order=2,
                status="in_progress",
            )
            completed_team = self.create_team_category(
                event=event,
                group=groups["senior"],
                gender="mixt",
                name=f"{prefix} Echipă Finalizat",
                athlete_pool=athletes["team"][:9],
                referees=referees,
                field=fields[0],
                order=3,
            )

            fight_sizes = [2, 4, 6, 7, 8, 11]
            fight_categories = []
            for index, size in enumerate(fight_sizes, start=1):
                pool_key = f"fight_{size}"
                category = self.create_fight_category(
                    event=event,
                    group=groups["senior" if size >= 8 else "cadet"],
                    gender="male" if index % 2 else "female",
                    name=f"{prefix} Luptă {size} sportivi",
                    athletes=athletes[pool_key][:size],
                    referees=referees,
                    field=fields[index % len(fields)],
                    order=10 + index,
                    completed=True,
                )
                fight_categories.append(category)

            self.seed_monitor_sessions(
                fields=fields,
                in_progress_solo=in_progress_solo,
                completed_fight=fight_categories[-1],
            )

        summary = {
            "groups": Group.objects.filter(event=event, name__startswith=prefix).count(),
            "categories": Category.objects.filter(event=event, name__startswith=prefix).count(),
            "athletes": Athlete.objects.filter(user__email__startswith=self.email_prefix(prefix)).count(),
            "referees": CompetitionReferee.objects.filter(event=event, athlete__user__email__startswith=self.email_prefix(prefix)).count(),
            "matches": Match.objects.filter(category__event=event, category__name__startswith=prefix).count(),
        }
        self.stdout.write(self.style.SUCCESS("✓ Seed complete"))
        for key, value in summary.items():
            self.stdout.write(f"  - {key}: {value}")
        self.stdout.write(self.style.SUCCESS(f"Use event {event.id} in the UI to inspect the seeded flow."))

    def email_prefix(self, prefix):
        return f"{self.slugify(prefix)}-"

    def slugify(self, value):
        return (
            value.lower()
            .replace("ă", "a")
            .replace("â", "a")
            .replace("î", "i")
            .replace("ș", "s")
            .replace("ş", "s")
            .replace("ț", "t")
            .replace("ţ", "t")
            .replace(" ", "-")
        )

    def cleanup_existing_seed(self, event, prefix):
        email_prefix = self.email_prefix(prefix)
        Category.objects.filter(event=event, name__startswith=prefix).delete()
        Group.objects.filter(event=event, name__startswith=prefix).delete()
        Team.objects.filter(members__athlete__user__email__startswith=email_prefix).distinct().delete()
        Athlete.objects.filter(user__email__startswith=email_prefix).delete()
        User.objects.filter(email__startswith=email_prefix).delete()
        Club.objects.filter(name__startswith=prefix).delete()
        City.objects.filter(name__startswith=prefix).delete()

    def ensure_supporting_entities(self, prefix):
        city = City.objects.create(name=f"{prefix} City")
        clubs = [
            Club.objects.create(name=f"{prefix} Club {index}", city=city, display_order=index)
            for index in range(1, 5)
        ]
        return city, clubs

    def create_user_and_athlete(self, *, email, username, first_name, last_name, club, birth_year, is_referee=False):
        user = User.objects.create_user(
            email=email,
            username=username,
            first_name=first_name,
            last_name=last_name,
            password="password123",
            role="athlete",
            profile_completed=True,
        )
        athlete = Athlete.objects.create(
            user=user,
            first_name=first_name,
            last_name=last_name,
            date_of_birth=date(birth_year, 5, 15),
            club=club,
            city=club.city,
            mobile_number=f"+40740{100000 + user.id}",
            status="approved",
            approved_by=None,
            reviewed_by=None,
            approved_date=timezone.now(),
            reviewed_date=timezone.now(),
            is_referee=is_referee,
            registered_date=timezone.now().date(),
            expiration_date=timezone.now().date() + timedelta(days=365),
        )
        return athlete

    def create_referees(self, clubs):
        referees = []
        prefix = self.slugify(self.prefix)
        first_names = ["Radu", "Mihai", "Cristina", "Elena", "Victor", "Sorin", "Ana"]
        last_names = ["Arbitru", "Central", "Juriu", "Diagonal", "Lateral", "Control", "Oficial"]
        for index in range(7):
            athlete = self.create_user_and_athlete(
                email=f"{prefix}-ref-{index + 1}@e2e.local",
                username=f"{prefix}_ref_{index + 1}",
                first_name=first_names[index],
                last_name=last_names[index],
                club=clubs[index % len(clubs)],
                birth_year=1985 + index,
                is_referee=True,
            )
            referees.append(athlete)
        return referees

    def create_athletes(self, clubs):
        prefix = self.slugify(self.prefix)
        pools = {
            "solo_male": [],
            "solo_female": [],
            "team": [],
            "fight_2": [],
            "fight_4": [],
            "fight_6": [],
            "fight_7": [],
            "fight_8": [],
            "fight_11": [],
        }

        def make_batch(pool_name, count, first_base, last_base, birth_year_start):
            created = []
            for offset in range(count):
                index = len(created) + 1
                athlete = self.create_user_and_athlete(
                    email=f"{prefix}-{pool_name}-{offset + 1}@e2e.local",
                    username=f"{prefix}_{pool_name}_{offset + 1}",
                    first_name=f"{first_base}{offset + 1}",
                    last_name=f"{last_base}",
                    club=clubs[offset % len(clubs)],
                    birth_year=birth_year_start + (offset % 6),
                    is_referee=False,
                )
                created.append(athlete)
            return created

        pools["solo_male"] = make_batch("solo-m", 6, "SoloM", "Demo", 2012)
        pools["solo_female"] = make_batch("solo-f", 6, "SoloF", "Demo", 2010)
        pools["team"] = make_batch("team", 9, "Team", "Demo", 2003)
        pools["fight_2"] = make_batch("fight-2", 2, "Fight2", "Demo", 2009)
        pools["fight_4"] = make_batch("fight-4", 4, "Fight4", "Demo", 2008)
        pools["fight_6"] = make_batch("fight-6", 6, "Fight6", "Demo", 2007)
        pools["fight_7"] = make_batch("fight-7", 7, "Fight7", "Demo", 2006)
        pools["fight_8"] = make_batch("fight-8", 8, "Fight8", "Demo", 2005)
        pools["fight_11"] = make_batch("fight-11", 11, "Fight11", "Demo", 2004)
        return pools

    def create_groups(self, event, prefix):
        return {
            "junior": Group.objects.create(
                event=event,
                name=f"{prefix} Juniori",
                birth_year_start=2012,
                birth_year_end=2014,
                display_order=900,
            ),
            "cadet": Group.objects.create(
                event=event,
                name=f"{prefix} Cadeți",
                birth_year_start=2008,
                birth_year_end=2011,
                display_order=901,
            ),
            "senior": Group.objects.create(
                event=event,
                name=f"{prefix} Seniori",
                birth_year_start=1990,
                birth_year_end=2007,
                display_order=902,
            ),
        }

    def ensure_fields(self, event):
        fields = list(event.fields.all().order_by("field_number"))
        while len(fields) < 2:
            field_number = len(fields) + 1
            fields.append(
                CompetitionField.objects.create(
                    event=event,
                    name=f"Teren {field_number}",
                    field_number=field_number,
                    start_time=time(9, 0),
                    is_active=True,
                )
            )
        return fields[:2]

    def register_referees(self, event, referees):
        for referee in referees:
            CompetitionReferee.objects.create(event=event, athlete=referee)

    def create_category_assignment(self, category, field, order, status, duration=20):
        start = self.base_now + timedelta(minutes=order * 12)
        assignment = CategoryFieldAssignment.objects.create(
            category=category,
            field=field,
            order=order,
            status=status,
            scheduled_start_time=start,
            estimated_duration=duration,
        )
        if status in {"in_progress", "completed"}:
            assignment.actual_start_time = start
        if status == "completed":
            assignment.actual_end_time = start + timedelta(minutes=duration)
        assignment.save(update_fields=["actual_start_time", "actual_end_time"])
        return assignment

    def referee_assignment_kwargs(self, referees):
        return {
            "referee_1": referees[0],
            "referee_2": referees[1],
            "referee_3": referees[2],
            "referee_4": referees[3],
            "referee_5": referees[4],
        }

    def create_solo_category(self, *, event, group, gender, name, athletes, referees, field, order, status):
        category = SoloCategory.objects.create(
            event=event,
            group=group,
            name=name,
            gender=gender,
            display_order=order,
        )
        self.create_category_assignment(category, field, order, status, duration=18)
        CategoryRefereeAssignment.objects.create(category=category, **self.referee_assignment_kwargs(referees))

        for index, athlete in enumerate(athletes, start=1):
            CategoryAthlete.objects.create(category=category, athlete=athlete)
            athlete_score = CategoryAthleteScore.objects.create(
                category=category,
                athlete=athlete,
                type="solo",
                status="approved",
                score=100 - index,
                submitted_by_athlete=False,
            )
            referee_count = 5 if status == "completed" else 3 if index <= 2 else 0
            for referee_index, referee in enumerate(referees[:referee_count], start=1):
                score = Decimal("98.0") - Decimal(index - 1) - Decimal(referee_index - 1) / Decimal("10")
                CategoryRefereeScore.objects.create(
                    athlete_score=athlete_score,
                    referee=referee,
                    deductions={"execution": float(Decimal("100.0") - score)},
                    score=score,
                )

        if status == "completed":
            category.first_place = athletes[0]
            category.second_place = athletes[1]
            category.third_place = athletes[2]
            category.save(update_fields=["first_place", "second_place", "third_place"])
        return category

    def create_team_category(self, *, event, group, gender, name, athlete_pool, referees, field, order):
        category = TeamCategory.objects.create(
            event=event,
            group=group,
            name=name,
            gender=gender,
            display_order=order,
        )
        self.create_category_assignment(category, field, order, "completed", duration=24)
        CategoryRefereeAssignment.objects.create(category=category, **self.referee_assignment_kwargs(referees))

        teams = []
        for team_index in range(3):
            team = Team.objects.create()
            members = athlete_pool[team_index * 3:(team_index + 1) * 3]
            for athlete in members:
                TeamMember.objects.create(team=team, athlete=athlete)
            CategoryTeam.objects.create(category=category, team=team)
            teams.append((team, members))

        for index, (team, members) in enumerate(teams, start=1):
            athlete_score = CategoryAthleteScore.objects.create(
                category=category,
                type="teams",
                status="approved",
                team_name=team.name,
                submitted_by_athlete=False,
            )
            athlete_score.team_members.set(members)
            for referee_index, referee in enumerate(referees[:5], start=1):
                score = Decimal("97.5") - Decimal(index - 1) - Decimal(referee_index - 1) / Decimal("10")
                CategoryRefereeScore.objects.create(
                    athlete_score=athlete_score,
                    referee=referee,
                    deductions={"sync": float(Decimal("100.0") - score)},
                    score=score,
                )

        category.first_place_team = teams[0][0]
        category.second_place_team = teams[1][0]
        category.third_place_team = teams[2][0]
        category.save(update_fields=["first_place_team", "second_place_team", "third_place_team"])
        return category

    def create_fight_category(self, *, event, group, gender, name, athletes, referees, field, order, completed):
        category = FightCategory.objects.create(
            event=event,
            group=group,
            name=name,
            gender=gender,
            display_order=order,
        )
        self.create_category_assignment(category, field, order, "completed" if completed else "in_progress", duration=36)

        for index, athlete in enumerate(athletes, start=1):
            CategoryAthlete.objects.create(
                category=category,
                athlete=athlete,
                weight=Decimal("60.0") + Decimal(index),
            )
            FightAthleteWeight.objects.update_or_create(
                category=category,
                athlete=athlete,
                defaults={
                    "pre_weight_kg": Decimal("62.0") + Decimal(index),
                    "current_weight_kg": Decimal("61.5") + Decimal(index),
                },
            )

        request = self.factory.post(
            f"/api/categories/{category.id}/generate-brackets/",
            {"bracket_type": "consolation"},
            format="json",
        )
        response = generate_brackets(request, category.id)
        if response.status_code >= 400:
            raise CommandError(f"Bracket generation failed for category {category.id}: {response.data}")

        matches = list(category.matches.select_related("red_corner", "blue_corner").order_by("round_number", "bracket_position", "id"))
        for match_index, match in enumerate(matches, start=1):
            MatchRefereeAssignment.objects.create(match=match, **self.referee_assignment_kwargs(referees))
            MatchFieldAssignment.objects.create(
                match=match,
                field=field,
                order=order * 10 + match_index,
                status="completed" if completed else "not_started",
                scheduled_start_time=self.base_now + timedelta(minutes=order * 12 + match_index * 4),
                actual_start_time=self.base_now + timedelta(minutes=order * 12 + match_index * 4) if completed else None,
                actual_end_time=self.base_now + timedelta(minutes=order * 12 + match_index * 4 + 3) if completed else None,
                estimated_duration=4,
            )
            match.field = field
            match.central_referee = referees[0]
            match.status = "completed" if completed else "scheduled"
            match.save(update_fields=["field", "central_referee", "status"])

        if completed:
            self.complete_fight_bracket(category, referees)
        return category

    def complete_fight_bracket(self, category, referees):
        self.propagate_byes(category)
        ordered_match_ids = list(category.matches.order_by("round_number", "bracket_position", "id").values_list("id", flat=True))
        for match_id in ordered_match_ids:
            match = Match.objects.select_related("red_corner", "blue_corner", "next_match", "loser_next_match").get(pk=match_id)
            if not match.red_corner or not match.blue_corner:
                continue
            winner_corner = "red" if (match.bracket_position % 2 == 0 or match.match_type == "finals") else "blue"
            self.score_match(match, referees, winner_corner)
            request = self.factory.post(f"/api/matches/{match.id}/advance-winner/", {}, format="json")
            response = advance_match_winner(request, match.id)
            if response.status_code >= 400:
                raise CommandError(f"Winner advancement failed for match {match.id}: {response.data}")
            self.propagate_byes(category)
            match.refresh_from_db()

        final_match = category.matches.filter(match_type="finals").order_by("-round_number", "bracket_position", "id").first()
        bronze_match = category.matches.filter(match_type="bronze").order_by("-round_number", "bracket_position", "id").first()
        if final_match and final_match.winner:
            category.first_place = final_match.winner
            category.second_place = (
                final_match.blue_corner
                if final_match.winner.pk == final_match.red_corner_id
                else final_match.red_corner
            )
        if bronze_match and bronze_match.winner:
            category.third_place = bronze_match.winner
        else:
            semifinals = list(category.matches.filter(match_type="semi-finals").select_related("red_corner", "blue_corner"))
            semifinal_losers = []
            for match in semifinals:
                if match.winner and match.winner.pk == match.red_corner_id and match.blue_corner_id:
                    semifinal_losers.append(match.blue_corner)
                elif match.winner and match.winner.pk == match.blue_corner_id and match.red_corner_id:
                    semifinal_losers.append(match.red_corner)
            if semifinal_losers:
                category.third_place = semifinal_losers[0]
        category.save(update_fields=["first_place", "second_place", "third_place"])

    def propagate_byes(self, category):
        changed = True
        while changed:
            changed = False
            matches = list(category.matches.select_related("red_corner", "blue_corner", "next_match").order_by("round_number", "bracket_position", "id"))
            for match in matches:
                if not match.next_match_id:
                    continue
                lone_athlete = None
                if match.red_corner_id and not match.blue_corner_id:
                    lone_athlete = match.red_corner
                elif match.blue_corner_id and not match.red_corner_id:
                    lone_athlete = match.blue_corner
                if not lone_athlete:
                    continue

                next_match = Match.objects.get(pk=match.next_match_id)
                target_is_empty = (
                    (match.bracket_position % 2 == 0 and not next_match.red_corner_id)
                    or (match.bracket_position % 2 == 1 and not next_match.blue_corner_id)
                )
                if target_is_empty:
                    _advance_to_next(next_match, match, lone_athlete)
                    changed = True

    def score_match(self, match, referees, winner_corner):
        start_time = self.base_now + timedelta(minutes=match.id % 15)
        round_objs = []
        for round_number in range(1, 4):
            round_obj = MatchRound.objects.create(
                match=match,
                round_number=round_number,
                status="completed",
                started_at=start_time + timedelta(minutes=round_number - 1),
                ended_at=start_time + timedelta(minutes=round_number),
            )
            round_objs.append(round_obj)

        for referee_index, referee in enumerate(referees[:5], start=1):
            for round_obj in round_objs:
                if winner_corner == "red":
                    red_score, blue_score = 10, 9 if referee_index < 5 else 10
                else:
                    red_score, blue_score = 9 if referee_index < 5 else 10, 10
                MatchRefereeScore.objects.create(
                    match=match,
                    referee=referee,
                    round=round_obj,
                    red_corner_score=red_score,
                    blue_corner_score=blue_score,
                )

            if winner_corner == "red":
                final_red = Decimal("30")
                final_blue = Decimal("27") if referee_index < 5 else Decimal("30")
            else:
                final_red = Decimal("27") if referee_index < 5 else Decimal("30")
                final_blue = Decimal("30")
            MatchRefereeScore.objects.create(
                match=match,
                referee=referee,
                round=None,
                red_corner_score=final_red,
                blue_corner_score=final_blue,
            )
            _sync_match_referee_score_to_legacy(match.id, referee.id)

        penalty_event = MatchEvent.objects.create(
            match=match,
            round=round_objs[0],
            event_type="penalty_red" if winner_corner == "red" else "penalty_blue",
            corner="red" if winner_corner == "red" else "blue",
            value=-1,
            notes="Seeded central penalty",
            created_by=referees[0],
        )
        _sync_match_event_to_legacy(penalty_event)

        MatchFieldAssignment.objects.filter(match=match).update(status="completed")
        Match.objects.filter(pk=match.pk).update(status="completed")

    def seed_monitor_sessions(self, *, fields, in_progress_solo, completed_fight):
        in_progress_assignment = in_progress_solo.field_assignment
        first_athlete = in_progress_solo.enrolled_athletes.select_related("athlete").first()
        DisplayMonitorSession.objects.update_or_create(
            field=fields[0],
            defaults={
                "current_category": in_progress_solo,
                "current_athlete": first_athlete.athlete if first_athlete else None,
                "current_match": None,
                "status": "displaying",
            },
        )

        featured_match = completed_fight.matches.filter(match_type="finals").order_by("-round_number", "id").first() or completed_fight.matches.order_by("-round_number", "id").first()
        DisplayMonitorSession.objects.update_or_create(
            field=fields[1],
            defaults={
                "current_category": completed_fight,
                "current_match": featured_match,
                "current_athlete": None,
                "status": "winner_revealed",
            },
        )
