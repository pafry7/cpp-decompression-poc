cmake_minimum_required(VERSION 3.13)

# Define the library name here.
project(appmodules)

# This file includes all the necessary to let you build your React Native application
include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

# Find and link op-sqlite for SQLite access
find_package(op-engineering_op-sqlite REQUIRED CONFIG)

# Define where the additional source code lives
target_sources(${CMAKE_PROJECT_NAME} PRIVATE ../../../../../shared/NativeSampleModule.cpp)

# Define where CMake can find the additional header files
target_include_directories(${CMAKE_PROJECT_NAME} PUBLIC ../../../../../shared)

# Link libraries
target_link_libraries(${CMAKE_PROJECT_NAME}
    op-engineering_op-sqlite::op-sqlite
    z
)
