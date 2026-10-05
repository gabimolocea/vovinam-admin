# ArduinoJson: doar headere, deci componentul n-are surse - doar spune unde sunt.
# Ca si la Arduino_GFX, se foloseste copia din ~/Documents/Arduino/libraries,
# aceeasi pe care o vede build-ul din Arduino IDE.
idf_component_register(
    INCLUDE_DIRS "$ENV{HOME}/Documents/Arduino/libraries/ArduinoJson/src"
)
