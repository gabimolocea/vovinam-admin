import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  UserIcon, 
  CalendarIcon, 
  TrophyIcon,
  ExternalLinkIcon,
  StarIcon,
  MapPinIcon,
  ClockIcon
} from 'lucide-react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import AxiosInstance from './Axios';
import { useAuth } from '../contexts/AuthContext';

const NewsSidebar = () => {
  const [suggestedAthletes, setSuggestedAthletes] = useState([]);
  const [upcomingCompetitions, setUpcomingCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    fetchSidebarData();
  }, []);

  const fetchSidebarData = async () => {
    try {
      // Fetch athletes using AxiosInstance (handles auth and cookies)
      const athletesResponse = await AxiosInstance.get('/athletes/');
      const allAthletes = athletesResponse.data.results || athletesResponse.data || [];
      
      // Shuffle array and take up to 5 athletes randomly
      const shuffledAthletes = [...allAthletes].sort(() => Math.random() - 0.5);
      setSuggestedAthletes(shuffledAthletes.slice(0, 5));

      // Fetch upcoming competitions using AxiosInstance
      const competitionsResponse = await AxiosInstance.get('/competitions/');
      const allCompetitions = competitionsResponse.data.results || competitionsResponse.data || [];
      setUpcomingCompetitions(allCompetitions.slice(0, 3));
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching sidebar data:', error);
      // Set fallback demo data if API calls fail (e.g., not authenticated)
      setSuggestedAthletes([
        { 
          id: 1, 
          first_name: 'Alex', 
          last_name: 'Johnson', 
          club: 'Elite Martial Arts', 
          current_grade: 'Black Belt 1st Dan' 
        },
        { 
          id: 2, 
          first_name: 'Maria', 
          last_name: 'Rodriguez', 
          club: 'Dragon Warriors Club', 
          current_grade: 'Brown Belt' 
        },
        { 
          id: 3, 
          first_name: 'Kim', 
          last_name: 'Chang', 
          club: 'Phoenix Academy', 
          current_grade: 'Black Belt 2nd Dan' 
        },
        { 
          id: 4, 
          first_name: 'John', 
          last_name: 'Smith', 
          club: 'Thunder Dojo', 
          current_grade: 'Red Belt' 
        },
        { 
          id: 5, 
          first_name: 'Sarah', 
          last_name: 'Wilson', 
          club: 'Victory Academy', 
          current_grade: 'Black Belt 3rd Dan' 
        }
      ]);
      
      setUpcomingCompetitions([
        {
          id: 1,
          name: 'National Championship 2025',
          start_date: '2025-12-15',
          place: 'Olympic Center, New York'
        },
        {
          id: 2,
          name: 'Regional Tournament',
          start_date: '2025-11-20',
          place: 'Sports Complex, Los Angeles'
        },
        {
          id: 3,
          name: 'Youth Development Cup',
          start_date: '2025-11-30',
          place: 'Community Center, Chicago'
        }
      ]);
      
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'TBD';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="w-80 space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-3">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 rounded"></div>
                <div className="h-3 bg-gray-200 rounded w-5/6"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="w-80 space-y-4 sticky top-4">
      {/* You May Know This Athlete Module */}
      <Card className="border border-gray-300 bg-white">
        <CardHeader className="pb-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-orange-500" />
            <h3 className="font-semibold text-sm text-gray-900">You may know this athlete</h3>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {suggestedAthletes.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {suggestedAthletes.slice(0, 5).map((athlete, index) => (
                <div key={athlete.id} className="p-3 hover:bg-gray-50 transition-all duration-200 hover:shadow-sm cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${
                      index === 0 ? 'from-orange-400 to-red-500' : 
                      index === 1 ? 'from-blue-400 to-purple-500' : 
                      index === 2 ? 'from-green-400 to-teal-500' :
                      index === 3 ? 'from-pink-400 to-rose-500' :
                      'from-indigo-400 to-purple-600'
                    } flex items-center justify-center shadow-sm`}>
                      <UserIcon className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">
                        {athlete.first_name} {athlete.last_name}
                      </div>
                      <div className="text-xs text-gray-600 truncate">
                        {athlete.club?.name || athlete.club || athlete.city || 'Independent Athlete'}
                      </div>
                      {athlete.current_grade && (
                        <Badge variant="outline" className="text-xs mt-1 border-orange-200 text-orange-700">
                          {athlete.current_grade}
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs px-3 py-1 h-auto border-gray-300 hover:border-orange-500 hover:text-orange-600 transition-colors"
                      onClick={() => navigate(`/athletes/${athlete.id}`)}
                    >
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500 text-sm">
              No athletes to suggest
            </div>
          )}
        </CardContent>
      </Card>

      {/* Banner Ad Module - 300x250 */}
      <Card className="border border-gray-300 bg-white">
        <CardContent className="p-0">
          <div className="w-full h-64 bg-gradient-to-br from-orange-500 via-red-500 to-pink-600 flex flex-col items-center justify-center text-white relative overflow-hidden cursor-pointer hover:scale-105 transition-transform duration-300">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-4 left-4 animate-pulse">
                <TrophyIcon className="h-8 w-8" />
              </div>
              <div className="absolute bottom-4 right-4 animate-bounce">
                <StarIcon className="h-6 w-6" />
              </div>
              <div className="absolute top-1/3 right-6 animate-pulse delay-1000">
                <CalendarIcon className="h-7 w-7" />
              </div>
              <div className="absolute bottom-1/3 left-6 animate-bounce delay-500">
                <UserIcon className="h-5 w-5" />
              </div>
            </div>
            
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>
            
            <div className="text-center z-10 px-4">
              <div className="animate-pulse">
                <TrophyIcon className="h-14 w-14 mx-auto mb-3 drop-shadow-lg" />
              </div>
              <h4 className="font-bold text-xl mb-2 drop-shadow-md">Join the Championship</h4>
              <p className="text-sm opacity-95 mb-4 leading-relaxed">
                🥋 Register now for the upcoming martial arts tournament and compete with the best!
              </p>
              <Button 
                size="sm" 
                className="bg-white text-orange-600 hover:bg-orange-50 font-semibold px-4 py-2 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5"
                onClick={() => window.open('/competitions', '_blank')}
              >
                🏆 Register Now
              </Button>
            </div>

            {/* Corner decoration */}
            <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-400 opacity-20 rounded-bl-full"></div>
            <div className="absolute bottom-0 left-0 w-12 h-12 bg-blue-400 opacity-20 rounded-tr-full"></div>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Competitions Module */}
      <Card className="border border-gray-300 bg-white">
        <CardHeader className="pb-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <TrophyIcon className="h-4 w-4 text-orange-500" />
            <h3 className="font-semibold text-sm text-gray-900">Upcoming Competitions</h3>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {upcomingCompetitions.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {upcomingCompetitions.slice(0, 3).map((competition) => (
                <div key={competition.id} className="p-3 hover:bg-gray-50 transition-colors cursor-pointer"
                     onClick={() => navigate(`/competitions/${competition.id}`)}>
                  <div className="space-y-2">
                    <div className="font-medium text-sm text-gray-900 line-clamp-2">
                      {competition.name}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <CalendarIcon className="h-3 w-3" />
                      <span>{formatDate(competition.start_date)}</span>
                    </div>
                    {competition.place && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <MapPinIcon className="h-3 w-3" />
                        <span className="truncate">{competition.place}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <Badge variant="default" className="text-xs">
                        Open Registration
                      </Badge>
                      <ExternalLinkIcon className="h-3 w-3 text-gray-400" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500 text-sm">
              No upcoming competitions
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NewsSidebar;