package com.foresight.dispatch.data

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

/**
 * Backend base URL.
 *
 *  - Real phone on the same Wi-Fi as the laptop:  http://<LAPTOP_LAN_IP>:8000/
 *    (find it with `ipconfig getifaddr en0` on the Mac, e.g. http://192.168.1.42:8000/)
 *  - Android emulator (host loopback):            http://10.0.2.2:8000/
 *
 * Keep the trailing slash. Change this one constant to repoint the whole app.
 */
object Backend {
    const val BASE_URL = "http://10.0.2.2:8000/"
}

interface ForesightApi {
    @GET("api/mobile/state")
    suspend fun getState(@Query("station") station: String): MobileState

    @POST("api/mobile/accept")
    suspend fun accept(@Body body: AcceptRequest): AcceptResponse
}

object ApiClient {
    val api: ForesightApi by lazy {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
        val client = OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .build()

        Retrofit.Builder()
            .baseUrl(Backend.BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ForesightApi::class.java)
    }
}
