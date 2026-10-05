# Aceleasi surse de panou ca firmware-ul de productie, nu copii.
set(PARTAJAT "${CMAKE_CURRENT_LIST_DIR}/../../referee-esp32s3-28b")

idf_component_register(
    SRCS "main.cpp"
         "${PARTAJAT}/ecran.cpp"
         "${PARTAJAT}/reglaje.cpp"
         "${PARTAJAT}/Display_ST7701.cpp"
         "${PARTAJAT}/I2C_Driver.cpp"
         "${PARTAJAT}/TCA9554PWR.cpp"
         "${PARTAJAT}/Touch_GT911.cpp"
    INCLUDE_DIRS "." "${PARTAJAT}"
    REQUIRES arduino-esp32 Arduino_GFX ArduinoJson lvgl
             esp_lcd driver esp_wifi nvs_flash esp_mm
)
