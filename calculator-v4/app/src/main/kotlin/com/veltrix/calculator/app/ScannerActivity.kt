package com.veltrix.calculator.app

import android.Manifest
import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.view.Gravity
import android.widget.*
import com.veltrix.calculator.core.TextAnalysisPlatform

class ScannerActivity:Activity(){
    private lateinit var ocr:OcrService
    private lateinit var recognized:TextView
    private lateinit var stats:TextView
    private var cameraUri:Uri?=null
    private var selectedLanguage="English / Latin"
    override fun onCreate(state:Bundle?){super.onCreate(state);ocr=OcrService(this);build()}
    private fun build(){
        val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(24,24,24,24)}
        root.addView(TextView(this).apply{text="Text / Language Scanner";textSize=24f})
        root.addView(Spinner(this).apply{adapter=ArrayAdapter(this@ScannerActivity,android.R.layout.simple_spinner_dropdown_item,listOf("English / Latin","Auto metadata unavailable"));onItemSelectedListener=object:android.widget.AdapterView.OnItemSelectedListener{override fun onNothingSelected(p:android.widget.AdapterView<*>?){};override fun onItemSelected(p:android.widget.AdapterView<*>?,v:android.view.View?,i:Int,l:Long){selectedLanguage=if(i==0)"English / Latin" else "Unspecified"}}})
        val row=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL}
        row.addView(Button(this).apply{text="Import image";setOnClickListener{startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply{type="image/*";addCategory(Intent.CATEGORY_OPENABLE)},REQ_IMPORT)}},LinearLayout.LayoutParams(0,-2,1f))
        row.addView(Button(this).apply{text="Camera";setOnClickListener{camera()}},LinearLayout.LayoutParams(0,-2,1f));root.addView(row)
        recognized=TextView(this).apply{text="Recognized text will appear here";setTextIsSelectable(true);textSize=18f;setPadding(0,20,0,12)};root.addView(recognized)
        stats=TextView(this).apply{tag="scanner-stats";text="0 words"};root.addView(stats)
        setContentView(ScrollView(this).apply{addView(root)})
    }
    private fun camera(){if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){requestPermissions(arrayOf(Manifest.permission.CAMERA),REQ_CAMERA_PERMISSION);return};openCamera()}
    private fun openCamera(){
        val values=ContentValues().apply{put(MediaStore.Images.Media.DISPLAY_NAME,"veltrix_scan_${System.currentTimeMillis()}.jpg");put(MediaStore.Images.Media.MIME_TYPE,"image/jpeg")}
        cameraUri=contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values)
        val uri=cameraUri?:return Toast.makeText(this,"Could not create camera image",Toast.LENGTH_SHORT).show()
        val intent=Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT,uri).addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        if(intent.resolveActivity(packageManager)!=null)startActivityForResult(intent,REQ_CAMERA) else Toast.makeText(this,"No camera app available",Toast.LENGTH_SHORT).show()
    }
    override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(requestCode==REQ_CAMERA_PERMISSION&&grantResults.firstOrNull()==PackageManager.PERMISSION_GRANTED)openCamera()}
    @Deprecated("Activity result compatibility") override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){super.onActivityResult(requestCode,resultCode,data);if(resultCode!=RESULT_OK)return;val uri=if(requestCode==REQ_CAMERA)cameraUri else data?.data;if(uri!=null)scan(uri)}
    private fun scan(uri:Uri){recognized.text="Recognizing…";ocr.recognize(uri,selectedLanguage){result->runOnUiThread{result.onSuccess{x->recognized.text=x.text.ifBlank{"No text recognized"};val a=TextAnalysisPlatform.analyze(x.text,x.selectedLanguage);stats.text="${a.characters} characters • ${a.charactersExcludingSpaces} excluding spaces • ${a.words} words • ${a.sentences} sentences • ${a.paragraphs} paragraphs\nLanguage metadata: ${x.selectedLanguage ?: "not provided"} • OCR blocks: ${x.blocks}"}.onFailure{recognized.text="OCR failed";stats.text=it.message?:"Recognition error"}}}}
    override fun onDestroy(){ocr.close();super.onDestroy()}
    companion object{private const val REQ_IMPORT=21;private const val REQ_CAMERA=22;private const val REQ_CAMERA_PERMISSION=23}
}
