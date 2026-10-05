# Arbitru FRVV 2.8B, pe ESP-IDF.
#
# Acelasi cod ca varianta din Arduino IDE (../referee-esp32s3-28b) - nu o
# copie, chiar aceleasi fisiere, vezi main/CMakeLists.txt. Singura diferenta e
# cine le compileaza si cu ce sdkconfig.
#
# De ce exista: pe nucleul Arduino, esp_lcd vine precompilat impotriva unui
# sdkconfig care spune CONFIG_SPIRAM_MODE_QUAD, in timp ce placa are PSRAM
# octal. Aici totul se compileaza din sursa, cu sdkconfig.defaults de langa
# acest fisier - deci modul de memorie, viteza ei, liniile de cache si locul
# intreruperii ecranului sunt ale noastre.
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
# USB CDC pe boot, ca in Arduino IDE.
#
# Nu e o optiune de sdkconfig - nucleul Arduino o citeste ca define la
# compilare, si de ea depinde ce clasa e `Serial`. Cu amandoua puse pe 1,
# Serial devine HWCDC, care are setTxTimeoutMs(); fara ele e HardwareSerial,
# care nu-l are, si sketch-ul nu compileaza. Trebuie globale, nu doar pentru
# componentul nostru, fiindca decizia se ia in headerul Arduino.
idf_build_set_property(COMPILE_OPTIONS "-DARDUINO_USB_MODE=1" APPEND)
idf_build_set_property(COMPILE_OPTIONS "-DARDUINO_USB_CDC_ON_BOOT=1" APPEND)

project(referee-esp32s3-28b-idf)
