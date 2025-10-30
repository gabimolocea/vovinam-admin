import React, { useEffect, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useNavigate, useParams } from "react-router-dom";
import { UserIcon, Building2Icon, CrownIcon } from "lucide-react";

import AxiosInstance from "./Axios";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Alert, AlertDescription } from "./ui/alert";
import DeleteDialog from "./DeleteDialog";
import { cn } from "../lib/utils";

const EditAthleteConverted = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // State for form data
  const [clubs, setClubs] = useState([]);
  const [cities, setCities] = useState([]);
  const [grades, setGrades] = useState([]);
  const [roles, setRoles] = useState([]);
  const [titles, setTitles] = useState([]);
  const [initialValues, setInitialValues] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // UI state
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch athlete data and reference data in parallel
        const [athleteResponse, clubsResponse, citiesResponse, gradesResponse, rolesResponse, titlesResponse] = await Promise.all([
          AxiosInstance.get(`athletes/${id}/`),
          AxiosInstance.get("clubs/").catch(() => ({ data: [] })),
          AxiosInstance.get("cities/").catch(() => ({ data: [] })),
          AxiosInstance.get("grades/").catch(() => ({ data: [] })),
          AxiosInstance.get("federation-roles/").catch(() => ({ data: [] })),
          AxiosInstance.get("titles/").catch(() => ({ data: [] }))
        ]);

        const athleteData = athleteResponse.data;
        
        // Set reference data
        setClubs(clubsResponse.data);
        setCities(citiesResponse.data);
        setGrades(gradesResponse.data);
        setRoles(rolesResponse.data);
        setTitles(titlesResponse.data);

        // Set initial form values
        setInitialValues({
          first_name: athleteData.first_name || "",
          last_name: athleteData.last_name || "",
          date_of_birth: athleteData.date_of_birth || "",
          city: athleteData.city || "",
          mobile_number: athleteData.mobile_number || "",
          club: athleteData.club || "",
          registered_date: athleteData.registered_date || "",
          expiration_date: athleteData.expiration_date || "",
          is_coach: athleteData.is_coach || false,
          federation_role: athleteData.federation_role || "",
          title: athleteData.title || "",
          current_grade: athleteData.current_grade || "",
        });
      } catch (error) {
        console.error("Error fetching athlete data:", error);
        setErrorMessage("Failed to load athlete data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchData();
    }
  }, [id]);

  const validationSchema = Yup.object({
    first_name: Yup.string().required("First name is required"),
    last_name: Yup.string().required("Last name is required"),
    date_of_birth: Yup.date().required("Date of birth is required"),
    city: Yup.string().required("City is required"),
  });

  const formik = useFormik({
    initialValues: initialValues || {
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
    enableReinitialize: true,
    validationSchema,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        setSubmitting(true);
        setErrorMessage("");
        
        const payload = {
          ...values,
          is_coach: values.is_coach === "true" || values.is_coach === true,
        };

        await AxiosInstance.put(`athletes/${id}/`, payload);
        setSuccessMessage("Athlete updated successfully!");
        
        // Redirect after a short delay to show success message
        setTimeout(() => {
          navigate("/athletes");
        }, 1500);
      } catch (error) {
        console.error("Error updating athlete:", error);
        setErrorMessage(
          error.response?.data?.message ||
          "Failed to update athlete. Please check all fields and try again."
        );
      } finally {
        setSubmitting(false);
      }
    },
  });

  const handleDelete = async () => {
    try {
      await AxiosInstance.delete(`athletes/${id}/`);
      setSuccessMessage("Athlete deleted successfully!");
      setOpenDeleteDialog(false);
      
      // Redirect after a short delay
      setTimeout(() => {
        navigate("/athletes");
      }, 1500);
    } catch (error) {
      console.error("Error deleting athlete:", error);
      setErrorMessage("Failed to delete athlete. Please try again.");
      setOpenDeleteDialog(false);
    }
  };

  if (loading || !initialValues) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading athlete data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Edit Athlete</h1>
        <p className="text-gray-600">Update athlete information and manage their profile</p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <AlertDescription className="text-green-800">
            {successMessage}
          </AlertDescription>
        </Alert>
      )}

      {/* Error Message */}
      {errorMessage && (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-800">
            {errorMessage}
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={formik.handleSubmit} className="space-y-6">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="h-5 w-5" />
              Personal Information
            </CardTitle>
            <CardDescription>
              Basic personal details of the athlete
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                name="first_name"
                type="text"
                value={formik.values.first_name}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={cn(
                  formik.touched.first_name && formik.errors.first_name && "border-red-500"
                )}
                placeholder="Enter first name"
              />
              {formik.touched.first_name && formik.errors.first_name && (
                <p className="text-sm text-red-600">{formik.errors.first_name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name *</Label>
              <Input
                id="last_name"
                name="last_name"
                type="text"
                value={formik.values.last_name}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={cn(
                  formik.touched.last_name && formik.errors.last_name && "border-red-500"
                )}
                placeholder="Enter last name"
              />
              {formik.touched.last_name && formik.errors.last_name && (
                <p className="text-sm text-red-600">{formik.errors.last_name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date_of_birth">Date of Birth *</Label>
              <Input
                id="date_of_birth"
                name="date_of_birth"
                type="date"
                value={formik.values.date_of_birth}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={cn(
                  formik.touched.date_of_birth && formik.errors.date_of_birth && "border-red-500"
                )}
              />
              {formik.touched.date_of_birth && formik.errors.date_of_birth && (
                <p className="text-sm text-red-600">{formik.errors.date_of_birth}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Select
                value={formik.values.city?.toString()}
                onValueChange={(value) => formik.setFieldValue("city", value)}
              >
                <SelectTrigger className={cn(
                  formik.touched.city && formik.errors.city && "border-red-500"
                )}>
                  <SelectValue placeholder="Select city" />
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
                <p className="text-sm text-red-600">{formik.errors.city}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mobile_number">Mobile Number</Label>
              <Input
                id="mobile_number"
                name="mobile_number"
                type="tel"
                value={formik.values.mobile_number}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="Enter mobile number"
              />
            </div>
          </CardContent>
        </Card>

        {/* Club Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2Icon className="h-5 w-5" />
              Club Information
            </CardTitle>
            <CardDescription>
              Club membership and registration details
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="club">Club</Label>
              <Select
                value={formik.values.club?.toString()}
                onValueChange={(value) => formik.setFieldValue("club", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select club" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Club</SelectItem>
                  {clubs.map((club) => (
                    <SelectItem key={club.id} value={club.id.toString()}>
                      {club.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="registered_date">Registered Date</Label>
              <Input
                id="registered_date"
                name="registered_date"
                type="date"
                value={formik.values.registered_date}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiration_date">Expiration Date</Label>
              <Input
                id="expiration_date"
                name="expiration_date"
                type="date"
                value={formik.values.expiration_date}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="is_coach">Is Coach</Label>
              <Select
                value={formik.values.is_coach?.toString()}
                onValueChange={(value) => formik.setFieldValue("is_coach", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select option" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Additional Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CrownIcon className="h-5 w-5" />
              Additional Information
            </CardTitle>
            <CardDescription>
              Federation roles, titles, and grading information
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="federation_role">Federation Role</Label>
              <Select
                value={formik.values.federation_role?.toString()}
                onValueChange={(value) => formik.setFieldValue("federation_role", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select federation role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Role</SelectItem>
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
              <Select
                value={formik.values.title?.toString()}
                onValueChange={(value) => formik.setFieldValue("title", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select title" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Title</SelectItem>
                  {titles.map((title) => (
                    <SelectItem key={title.id} value={title.id.toString()}>
                      {title.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="current_grade">Current Grade</Label>
              <Select
                value={formik.values.current_grade?.toString()}
                onValueChange={(value) => formik.setFieldValue("current_grade", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select current grade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Grade</SelectItem>
                  {grades.map((grade) => (
                    <SelectItem key={grade.id} value={grade.id.toString()}>
                      {grade.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                type="submit"
                disabled={formik.isSubmitting}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {formik.isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Updating...
                  </>
                ) : (
                  "Update Athlete"
                )}
              </Button>
              
              <Button
                type="button"
                variant="destructive"
                onClick={() => setOpenDeleteDialog(true)}
                className="flex-1"
              >
                Delete Athlete
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/athletes")}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Delete Confirmation Dialog */}
      <DeleteDialog
        open={openDeleteDialog}
        onClose={() => setOpenDeleteDialog(false)}
        onConfirm={handleDelete}
        itemName={`${formik.values.first_name} ${formik.values.last_name}`}
      />
    </div>
  );
};

export default EditAthleteConverted;