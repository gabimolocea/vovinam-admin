import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Alert, AlertDescription } from './ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Search, Plus, Edit, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';

const TestAthletes = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Mock data for testing
  const mockAthletes = [
    {
      id: 1,
      name: 'John Doe',
      email: 'john@example.com',
      club: 'Elite Martial Arts',
      grade: 'Black Belt 1st Dan',
      status: 'Active',
      registrationDate: '2024-01-15'
    },
    {
      id: 2,
      name: 'Jane Smith',
      email: 'jane@example.com',
      club: 'Warriors Dojo',
      grade: 'Brown Belt',
      status: 'Pending',
      registrationDate: '2024-02-20'
    },
    {
      id: 3,
      name: 'Mike Johnson',
      email: 'mike@example.com',
      club: 'Victory Academy',
      grade: 'Black Belt 2nd Dan',
      status: 'Active',
      registrationDate: '2023-11-10'
    }
  ];

  const filteredAthletes = mockAthletes.filter(athlete =>
    athlete.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    athlete.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    athlete.club.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'Active':
        return 'default';
      case 'Pending':
        return 'secondary';
      case 'Inactive':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Athletes</h1>
          <p className="text-muted-foreground">Manage athlete registrations and profiles</p>
        </div>
        <Button asChild>
          <Link to="/create-athlete">
            <Plus className="mr-2 h-4 w-4" />
            Add Athlete
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Athletes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search by name, email, or club..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Athletes ({filteredAthletes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredAthletes.length === 0 ? (
            <Alert>
              <AlertDescription>
                No athletes found matching your search criteria.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Athlete</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Registration Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAthletes.map((athlete) => (
                    <TableRow key={athlete.id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <Avatar>
                            <AvatarImage src={`/api/placeholder/40/40`} />
                            <AvatarFallback>{getInitials(athlete.name)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{athlete.name}</p>
                            <p className="text-sm text-muted-foreground">{athlete.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{athlete.club}</TableCell>
                      <TableCell>{athlete.grade}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(athlete.status)}>
                          {athlete.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(athlete.registrationDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/athletes/${athlete.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/athletes/edit/${athlete.id}`}>
                              <Edit className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Alert>
        <AlertDescription>
          This is a test Athletes component showcasing the shadcn/ui table, search, and navigation integration.
          The actual data would be loaded from your API endpoints.
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default TestAthletes;