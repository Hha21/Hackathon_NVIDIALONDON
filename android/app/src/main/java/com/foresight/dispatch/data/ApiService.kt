package com.foresight.dispatch.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface ApiService {
    @GET("api/mobile/state")
    suspend fun getState(@Query("station") station: String): MobileState

    @POST("api/mobile/accept")
    suspend fun accept(@Body request: AcceptRequest): AcceptResponse

    @POST("api/ask")
    suspend fun ask(@Body request: AskRequest): AskResponse
}
