# Sursele sunt cele din folderul Arduino, nu copii ale lor.
#
# Intentionat: doua copii ale unui sketch de 3400 de linii s-ar desincroniza la
# prima corectie facuta doar intr-una. Asa, orice schimbare se vede in ambele
# build-uri, si comparatia dintre ele spune ceva despre platforma - nu despre
# care copie e mai noua.
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
    # Fara lista asta, directoarele de include ale celorlalte componente nu se
    # propaga aici si sketch-ul nu gaseste Arduino_GFX_Library.h sau
    # ArduinoJson.h. In Arduino IDE nu se pune problema: acolo toate
    # bibliotecile sunt pe un singur drum de cautare.
    REQUIRES arduino-esp32 Arduino_GFX ArduinoJson
             esp_lcd driver esp_wifi nvs_flash esp_http_client
             # esp_mm: de acolo vine esp_cache.h, pentru scrierea
             # framebuffer-ului din cache in PSRAM (vezi ecran.h).
             esp_mm
)
