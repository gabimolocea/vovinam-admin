import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Alert, AlertDescription } from "./ui/alert";
import { Loader2, Calendar, ArrowLeft } from "lucide-react";
import { useFormik } from "formik";
import * as Yup from "yup";
import AxiosInstance from "./Axios";
import { useNavigate } from "react-router-dom";

const CreateAthlete = () => {
  const [clubs, setClubs] = useState([]);
  const [cities, setCities] = useState([]);
  const [grades, setGrades] = useState([]);
  const [roles, setRoles] = useState([]);
  const [titles, setTitles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [clubsResponse, citiesResponse, gradesResponse, rolesResponse, titlesResponse] = await Promise.all([
          AxiosInstance.get("clubs/").catch(() => ({ data: [] })),
          AxiosInstance.get("cities/").catch(() => ({ data: [] })),
          AxiosInstance.get("grades/").catch(() => ({ data: [] })),
          AxiosInstance.get("federation-roles/").catch(() => ({ data: [] })),
          AxiosInstance.get("titles/").catch(() => ({ data: [] }))
        ]);

        setClubs(clubsResponse.data.map((club) => ({ id: club.id, name: club.name })));
        setCities(citiesResponse.data.map((city) => ({ id: city.id, name: city.name })));
        setGrades(gradesResponse.data.map((grade) => ({ id: grade.id, name: grade.name })));
        setRoles(rolesResponse.data.map((role) => ({ id: role.id, name: role.name })));
        setTitles(titlesResponse.data.map((title) => ({ id: title.id, name: title.name })));
      } catch (error) {
        console.error("Error fetching form data:", error);
        setError("Failed to load form data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formik = useFormik({
    initialValues: {
      first_name: "",
      last_name: "",
      date_of_birth: "",
      city: "",
      mobile_number: "",
      club: "",
      registered_date: "",
      expiration_date: "",
      is_coach: false,
      federation_role: "",
      title: "",
      current_grade: "",
    },
    validationSchema: Yup.object({
      first_name: Yup.string()
        .required("First name is required")
        .min(2, "First name must be at least 2 characters"),
      last_name: Yup.string()
        .required("Last name is required")
        .min(2, "Last name must be at least 2 characters"),
      date_of_birth: Yup.string().required("Date of birth is required"),
      city: Yup.string().required("City is required"),
      mobile_number: Yup.string()
        .matches(/^[0-9+\-\s()]+$/, "Please enter a valid phone number"),
      club: Yup.string().required("Club is required"),
      current_grade: Yup.string().required("Current grade is required"),
    }),
    onSubmit: async (values) => {
      try {
        setSubmitting(true);
        setError(null);

        const payload = {
          ...values,
          city: values.city ? parseInt(values.city) : null,
          club: values.club ? parseInt(values.club) : null,
          current_grade: values.current_grade ? parseInt(values.current_grade) : null,
          federation_role: values.federation_role ? parseInt(values.federation_role) : null,
          title: values.title ? parseInt(values.title) : null,
        };

        console.log("Submitting athlete data:", payload);

        await AxiosInstance.post("athletes/", payload);
        console.log("Athlete created successfully");
        navigate("/athletes");
      } catch (error) {
        console.error("Error creating athlete:", error);
        setError(error.response?.data?.detail || "Failed to create athlete");
      } finally {
        setSubmitting(false);
      }
    },
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading form data...</span>
      </div>
    );
  }

  return (
    <div className="p-6 mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Athlete</h1>
          <p className="text-muted-foreground">Add a new athlete to the system</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/athletes")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Athletes
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={formik.handleSubmit} className="space-y-6">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input
                  id="first_name"
                  name="first_name"
                  value={formik.values.first_name}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  placeholder="Enter first name"
                  className={formik.touched.first_name && formik.errors.first_name ? "border-red-500" : ""}
                />
                {formik.touched.first_name && formik.errors.first_name && (
                  <p className="text-sm text-red-500">{formik.errors.first_name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input
                  id="last_name"
                  name="last_name"
                  value={formik.values.last_name}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  placeholder="Enter last name"
                  className={formik.touched.last_name && formik.errors.last_name ? "border-red-500" : ""}
                />
                {formik.touched.last_name && formik.errors.last_name && (
                  <p className="text-sm text-red-500">{formik.errors.last_name}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date_of_birth">Date of Birth *</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="date_of_birth"
                    name="date_of_birth"
                    type="date"
                    value={formik.values.date_of_birth}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className={`pl-10 ${formik.touched.date_of_birth && formik.errors.date_of_birth ? "border-red-500" : ""}`}
                  />
                </div>
                {formik.touched.date_of_birth && formik.errors.date_of_birth && (
                  <p className="text-sm text-red-500">{formik.errors.date_of_birth}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="mobile_number">Mobile Number</Label>
                <Input
                  id="mobile_number"
                  name="mobile_number"
                  value={formik.values.mobile_number}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  placeholder="Enter mobile number"
                  className={formik.touched.mobile_number && formik.errors.mobile_number ? "border-red-500" : ""}
                />
                {formik.touched.mobile_number && formik.errors.mobile_number && (
                  <p className="text-sm text-red-500">{formik.errors.mobile_number}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Select onValueChange={(value) => formik.setFieldValue("city", value)} value={formik.values.city}>
                <SelectTrigger className={formik.touched.city && formik.errors.city ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select a city" />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((city) => (
                    <SelectItem key={city.id} value={city.id.toString()}>
                      {city.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formik.touched.city && formik.errors.city && (
                <p className="text-sm text-red-500">{formik.errors.city}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Club Information */}
        <Card>
          <CardHeader>
            <CardTitle>Club Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="club">Club *</Label>
                <Select onValueChange={(value) => formik.setFieldValue("club", value)} value={formik.values.club}>
                  <SelectTrigger className={formik.touched.club && formik.errors.club ? "border-red-500" : ""}>
                    <SelectValue placeholder="Select a club" />
                  </SelectTrigger>
                  <SelectContent>
                    {clubs.map((club) => (
                      <SelectItem key={club.id} value={club.id.toString()}>
                        {club.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formik.touched.club && formik.errors.club && (
                  <p className="text-sm text-red-500">{formik.errors.club}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="current_grade">Current Grade *</Label>
                <Select onValueChange={(value) => formik.setFieldValue("current_grade", value)} value={formik.values.current_grade}>
                  <SelectTrigger className={formik.touched.current_grade && formik.errors.current_grade ? "border-red-500" : ""}>
                    <SelectValue placeholder="Select current grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {grades.map((grade) => (
                      <SelectItem key={grade.id} value={grade.id.toString()}>
                        {grade.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formik.touched.current_grade && formik.errors.current_grade && (
                  <p className="text-sm text-red-500">{formik.errors.current_grade}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="registered_date">Registration Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="registered_date"
                    name="registered_date"
                    type="date"
                    value={formik.values.registered_date}
                    onChange={formik.handleChange}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiration_date">Expiration Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="expiration_date"
                    name="expiration_date"
                    type="date"
                    value={formik.values.expiration_date}
                    onChange={formik.handleChange}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Additional Information */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="federation_role">Federation Role</Label>
                <Select onValueChange={(value) => formik.setFieldValue("federation_role", value)} value={formik.values.federation_role}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select federation role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id.toString()}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Select onValueChange={(value) => formik.setFieldValue("title", value)} value={formik.values.title}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select title" />
                  </SelectTrigger>
                  <SelectContent>
                    {titles.map((title) => (
                      <SelectItem key={title.id} value={title.id.toString()}>
                        {title.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_coach"
                name="is_coach"
                checked={formik.values.is_coach}
                onChange={formik.handleChange}
                className="rounded border-gray-300"
              />
              <Label htmlFor="is_coach">This athlete is also a coach</Label>
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end space-x-4">
          <Button type="button" variant="outline" onClick={() => navigate("/athletes")}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Athlete"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CreateAthlete;