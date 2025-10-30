import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Building2Icon, MapPinIcon, PhoneIcon, GlobeIcon } from "lucide-react";

import AxiosInstance from "./Axios";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Alert, AlertDescription } from "./ui/alert";
import DeleteDialog from "./DeleteDialog";
import { cn } from "../lib/utils";

const EditClubConverted = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // State
  const [cities, setCities] = useState([]);
  const [initialValues, setInitialValues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch club data and cities in parallel
        const [clubResponse, citiesResponse] = await Promise.all([
          AxiosInstance.get(`clubs/${id}/`),
          AxiosInstance.get("cities/").catch(() => ({ data: [] }))
        ]);

        const clubData = clubResponse.data;
        
        setCities(citiesResponse.data);
        setInitialValues({
          name: clubData.name || "",
          city: clubData.city?.id || clubData.city || "",
          address: clubData.address || "",
          coach: clubData.coach || "",
          mobile_number: clubData.mobile_number || "",
          website: clubData.website || "",
        });
      } catch (error) {
        console.error("Error fetching club data:", error);
        setErrorMessage("Failed to load club data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchData();
    }
  }, [id]);

  const validationSchema = Yup.object({
    name: Yup.string().required("Club name is required"),
    city: Yup.string().required("City is required"),
    address: Yup.string().required("Address is required"),
    mobile_number: Yup.string()
      .matches(/^[0-9]+$/, "Mobile number must be digits")
      .required("Mobile number is required"),
    website: Yup.string()
      .matches(
        /^(https?:\/\/)[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+$/,
        "Website must start with 'http://' or 'https://' and be a valid URL"
      )
      .required("Website is required"),
  });

  const formik = useFormik({
    initialValues: initialValues || {
      name: "",
      city: "",
      address: "",
      coach: "",
      mobile_number: "",
      website: "",
    },
    enableReinitialize: true,
    validationSchema,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        setSubmitting(true);
        setErrorMessage("");
        
        await AxiosInstance.put(`clubs/${id}/`, values);
        setSuccessMessage("Club updated successfully!");
        
        // Redirect after a short delay
        setTimeout(() => {
          navigate("/clubs");
        }, 1500);
      } catch (error) {
        console.error("Error updating club:", error);
        setErrorMessage(
          error.response?.data?.message ||
          "Failed to update club. Please check all fields and try again."
        );
      } finally {
        setSubmitting(false);
      }
    },
  });

  const handleDelete = async () => {
    try {
      await AxiosInstance.delete(`clubs/${id}/`);
      setSuccessMessage("Club deleted successfully!");
      setOpenDeleteDialog(false);
      
      // Redirect after a short delay
      setTimeout(() => {
        navigate("/clubs");
      }, 1500);
    } catch (error) {
      console.error("Error deleting club:", error);
      setErrorMessage("Failed to delete club. Please try again.");
      setOpenDeleteDialog(false);
    }
  };

  if (loading || !initialValues) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading club data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Edit Club</h1>
        <p className="text-gray-600">Update club information and manage profile</p>
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
        {/* Club Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2Icon className="h-5 w-5" />
              Club Information
            </CardTitle>
            <CardDescription>
              Basic information about the club
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Club Name *</Label>
              <Input
                id="name"
                name="name"
                type="text"
                value={formik.values.name}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={cn(
                  formik.touched.name && formik.errors.name && "border-red-500"
                )}
                placeholder="Enter club name"
              />
              {formik.touched.name && formik.errors.name && (
                <p className="text-sm text-red-600">{formik.errors.name}</p>
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

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address" className="flex items-center gap-2">
                <MapPinIcon className="h-4 w-4" />
                Address *
              </Label>
              <Input
                id="address"
                name="address"
                type="text"
                value={formik.values.address}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={cn(
                  formik.touched.address && formik.errors.address && "border-red-500"
                )}
                placeholder="Enter club address"
              />
              {formik.touched.address && formik.errors.address && (
                <p className="text-sm text-red-600">{formik.errors.address}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="coach">Coach</Label>
              <Input
                id="coach"
                name="coach"
                type="text"
                value={formik.values.coach}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="Enter coach name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mobile_number" className="flex items-center gap-2">
                <PhoneIcon className="h-4 w-4" />
                Mobile Number *
              </Label>
              <Input
                id="mobile_number"
                name="mobile_number"
                type="tel"
                value={formik.values.mobile_number}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={cn(
                  formik.touched.mobile_number && formik.errors.mobile_number && "border-red-500"
                )}
                placeholder="Enter mobile number"
              />
              {formik.touched.mobile_number && formik.errors.mobile_number && (
                <p className="text-sm text-red-600">{formik.errors.mobile_number}</p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="website" className="flex items-center gap-2">
                <GlobeIcon className="h-4 w-4" />
                Website *
              </Label>
              <Input
                id="website"
                name="website"
                type="url"
                value={formik.values.website}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={cn(
                  formik.touched.website && formik.errors.website && "border-red-500"
                )}
                placeholder="https://example.com"
              />
              {formik.touched.website && formik.errors.website && (
                <p className="text-sm text-red-600">{formik.errors.website}</p>
              )}
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
                  "Update Club"
                )}
              </Button>
              
              <Button
                type="button"
                variant="destructive"
                onClick={() => setOpenDeleteDialog(true)}
                className="flex-1"
              >
                Delete Club
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/clubs")}
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
        itemName={formik.values.name || "this club"}
      />
    </div>
  );
};

export default EditClubConverted;