if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "/Users/dylanbozarth/.gradle/caches/8.14.1/transforms/816951bc71efb4c99db481b15113489d/transformed/hermes-android-0.80.1-debug/prefab/modules/libhermes/libs/android.x86_64/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/dylanbozarth/.gradle/caches/8.14.1/transforms/816951bc71efb4c99db481b15113489d/transformed/hermes-android-0.80.1-debug/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

