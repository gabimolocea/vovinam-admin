import { React, useState, useEffect } from "react";
import AxiosInstance from "./Axios";
import { Box, FormControl, Stack, Button } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import TextForm from "./forms/TextForm";
import SelectForm from "./forms/SelectForm";
import { Form } from "react-router";
import {useFormik} from "formik";
import * as Yup from "yup";
import MyMessage from "./forms/Message";
import { useNavigate } from "react-router";

const CreateClub = () => {
  const [city, setCity] = useState([]);
  const [club, setClub] = useState([]);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  console.log("City", city);
  console.log("Club", club);

  const GetData = async () => {
    AxiosInstance.get("city/").then((res) => {
      setCity(res.data);
    });

    AxiosInstance.get("club/").then((res) => {
      setClub(res.data);
    });
  };

  useEffect(() => {
    GetData();
  }, []);

  useEffect(() => {
    console.log("City Options:", city); // Debugging: Log the city options
  }, [city]);

  const validationSchema = Yup.object({
    name: Yup
      .string()
      .required("Club name is required"),
    city: Yup
      .string()
      .required("City is required"),
    address: Yup
      .string()
      .required("Address is required"),
    mobile_number: Yup
      .string()
      .matches(/^[0-9]+$/, "Mobile number must be digits")
      .required("Mobile number is required"),
    website: Yup
      .string()
      .matches(
        /^(http:\/\/)[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+$/,
        "Website must start with 'http://' and be a valid URL"
      )
      .required("Website is required"),
  });
  const formik = useFormik({
    initialValues: {
      name: "",
      city: "",
      address: "",
      coach: "",
      mobile_number: "",
      website: "",
    },

    validationSchema: validationSchema,

    onSubmit: (values) => {
      const selectedCity = city.find((c) => c.id === parseInt(values.city, 10));

      if (!selectedCity) {
        console.error("City not found in options:", values.city);
        return;
      }

      const payload = {
        ...values,
        city: selectedCity.id, // Send only the city ID
      };

      console.log("Submitting Payload:", payload);

      AxiosInstance.post("club/", payload)
        .then(() => {
          setMessage(
            <MyMessage
              messageText={"You successfully created a club!"}
              messageColor={"green"}
            />
          );
          setTimeout(() => {
            navigate("/");
          }, 2000);
        })
        .catch((error) => {
          console.error("Error creating club:", error.response.data);
        });
    },
  })
  return (
    <div>
    <form onSubmit={formik.handleSubmit}>
    {message}
    <Box>
      <FormControl sx={{display: 'flex', flexWrap: 'wrap', width: '100%', gap: 2}}>
          <TextForm 
          label={"Club name"} 
          name = 'name'
          value = {formik.values.name} 
          onChange = {formik.handleChange}
          onBlur = {formik.handleBlur}
          error = {formik.touched.name && Boolean(formik.errors.name)}
          helperText = {formik.touched.name && formik.errors.name} />
          

          <SelectForm
          label={"City"}
          options={city} // Pass the formatted city options
          name="city"
          value={formik.values.city || ""} // Ensure this matches one of the option values or is an empty string
          onChange={formik.handleChange}
          onBlur={formik.handleBlur}
          error={formik.touched.city && Boolean(formik.errors.city)}
          helperText={formik.touched.city && formik.errors.city}
          />

          <TextForm 
          label={"Address"} 
          name = 'address'
          value = {formik.values.address} 
          onChange = {formik.handleChange}
          onBlur = {formik.handleBlur}
          error = {formik.touched.address && Boolean(formik.errors.address)}
          helperText = {formik.touched.address && formik.errors.address} />

          <TextForm 
          label={"Mobile number"} 
          name = 'mobile_number'
          value = {formik.values.mobile_number} 
          onChange = {formik.handleChange}
          onBlur = {formik.handleBlur}
          error = {formik.touched.mobile_number && Boolean(formik.errors.mobile_number)}
          helperText = {formik.touched.mobile_number && formik.errors.mobile_number}
          />

          <TextForm 
          label={"Website"}
          name = 'website'
          value = {formik.values.website} 
          onChange = {formik.handleChange}
          onBlur = {formik.handleBlur} 
          error = {formik.touched.website && Boolean(formik.errors.website)}
          helperText = {formik.touched.website && formik.errors.website}
          />

          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
            <Button type="submit" variant="contained" size="large" startIcon={<AddIcon />}>
              Submit the data
            </Button>
          </Stack>
          </FormControl>
      </Box>
      </form>
    </div>
  );
};

export default CreateClub;
