plugins {
    id("com.android.application")
    kotlin("android")
}

android {
    namespace = "com.veltrix.calculator.app"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.veltrix.calculator"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "2.1.0-backend-iteration-1.1"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    testOptions { animationsDisabled = true }
}

dependencies {
    implementation(project(":core"))
    implementation("androidx.activity:activity-ktx:1.13.0")
    implementation("androidx.work:work-runtime:2.11.2")
    implementation("com.google.mlkit:text-recognition:16.0.1")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test:core-ktx:1.7.0")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
}
