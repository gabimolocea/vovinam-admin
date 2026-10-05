# Arduino_GFX ca component ESP-IDF.
#
# Biblioteca nu e copiata aici: se compileaza din ~/Documents/Arduino/libraries,
# acelasi loc din care o ia si build-ul din Arduino IDE. Daca ar fi doua copii,
# comparatia dintre cele doua build-uri n-ar mai spune nimic despre platforma -
# ar putea sa spuna doar ca una are alta versiune de biblioteca.
set(GFX "$ENV{HOME}/Documents/Arduino/libraries/Arduino_GFX-master/src")

# Toate sursele, nu doar cele folosite: biblioteca are 101 fisiere cu zeci de
# drivere de ecran, iar linkerul arunca ce nu se cheama. Mai simplu si mai
# robust decat o lista pe care ar trebui s-o actualizez la fiecare schimbare.
file(GLOB_RECURSE GFX_SRCS "${GFX}/*.cpp" "${GFX}/*.c")

idf_component_register(
    SRCS ${GFX_SRCS}
    INCLUDE_DIRS "${GFX}" "${GFX}/databus" "${GFX}/display" "${GFX}/canvas" "${GFX}/font"
    REQUIRES arduino-esp32 driver esp_lcd
)
