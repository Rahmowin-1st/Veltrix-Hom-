package com.veltrix.calculator.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

data class OcrTextResult(val text:String,val blocks:Int,val lines:Int,val selectedLanguage:String?,val engine:String="mlkit-latin-bundled")

class OcrService(private val context:Context){
    private val recognizer=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    fun recognize(uri:Uri,selectedLanguage:String?=null,callback:(Result<OcrTextResult>)->Unit){
        try{
            val bitmap=context.contentResolver.openInputStream(uri)?.use{BitmapFactory.decodeStream(it)}
                ?:return callback(Result.failure(IllegalArgumentException("Image could not be decoded")))
            recognizeBitmap(bitmap, selectedLanguage, callback)
        }catch(e:Exception){callback(Result.failure(e))}
    }
    fun recognizeBitmap(bitmap: Bitmap, selectedLanguage:String?=null, callback:(Result<OcrTextResult>)->Unit){
        recognizer.process(InputImage.fromBitmap(bitmap,0))
            .addOnSuccessListener{t->callback(Result.success(OcrTextResult(t.text,t.textBlocks.size,t.textBlocks.sumOf{it.lines.size},selectedLanguage)))}
            .addOnFailureListener{e->callback(Result.failure(e))}
    }
    fun close(){recognizer.close()}
}
